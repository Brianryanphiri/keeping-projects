const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// Helper function to generate unique invoice number
const generateInvoiceNumber = () => {
    const prefix = 'INV';
    const year = new Date().getFullYear();
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}-${year}${timestamp}${random}`;
};

// Helper function to calculate due date (default: 30 days)
const calculateDueDate = (issueDate, terms = 30) => {
    const date = new Date(issueDate);
    date.setDate(date.getDate() + terms);
    return date;
};

// ==================== INVOICE CRUD OPERATIONS ====================

/**
 * GET /api/invoices
 * Get all invoices with filters
 */
const getAllInvoices = async (req, res) => {
    try {
        const { status, search, from, to, customer } = req.query;

        let query = `
            SELECT 
                i.*,
                COUNT(ii.id) as item_count,
                DATEDIFF(i.due_date, CURDATE()) as days_until_due,
                CASE 
                    WHEN i.status = 'paid' THEN 'paid'
                    WHEN i.due_date < CURDATE() AND i.balance_due > 0 THEN 'overdue'
                    WHEN i.status = 'draft' THEN 'draft'
                    ELSE i.status
                END as calculated_status,
                DATE_FORMAT(i.issue_date, '%Y-%m-%d') as formatted_issue_date,
                DATE_FORMAT(i.due_date, '%Y-%m-%d') as formatted_due_date,
                DATE_FORMAT(i.paid_date, '%Y-%m-%d') as formatted_paid_date,
                DATE_FORMAT(i.created_at, '%Y-%m-%d %H:%i') as formatted_created_at
            FROM invoices i
            LEFT JOIN invoice_items ii ON i.id = ii.invoice_id
            WHERE 1=1
        `;

        const params = [];

        if (status && status !== 'all') {
            if (status === 'overdue') {
                query += ` AND i.due_date < CURDATE() AND i.balance_due > 0 AND i.status != 'paid'`;
            } else {
                query += ` AND i.status = ?`;
                params.push(status);
            }
        }

        if (search) {
            query += ` AND (
                i.invoice_number LIKE ? OR 
                i.customer_name LIKE ? OR 
                i.customer_email LIKE ? OR 
                i.customer_company LIKE ?
            )`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        if (customer) {
            query += ` AND i.customer_email = ?`;
            params.push(customer);
        }

        if (from) {
            query += ` AND DATE(i.issue_date) >= ?`;
            params.push(from);
        }

        if (to) {
            query += ` AND DATE(i.issue_date) <= ?`;
            params.push(to);
        }

        query += ` GROUP BY i.id ORDER BY i.created_at DESC`;

        const [invoices] = await pool.query(query, params);

        // Get items for each invoice
        for (const invoice of invoices) {
            const [items] = await pool.query(`
                SELECT * FROM invoice_items 
                WHERE invoice_id = ? 
                ORDER BY sort_order ASC, id ASC
            `, [invoice.id]);
            invoice.items = items;
            
            // Get payment history
            const [payments] = await pool.query(`
                SELECT * FROM invoice_payments 
                WHERE invoice_id = ? 
                ORDER BY payment_date DESC
            `, [invoice.id]);
            invoice.payments = payments;
        }

        res.json(invoices);
    } catch (error) {
        console.error('Error fetching invoices:', error);
        res.status(500).json({ 
            message: 'Error fetching invoices',
            error: error.message 
        });
    }
};

/**
 * GET /api/invoices/:id
 * Get single invoice by ID
 */
const getInvoiceById = async (req, res) => {
    try {
        const { id } = req.params;

        const [invoices] = await pool.query(`
            SELECT 
                i.*,
                DATEDIFF(i.due_date, CURDATE()) as days_until_due,
                DATE_FORMAT(i.issue_date, '%Y-%m-%d') as formatted_issue_date,
                DATE_FORMAT(i.due_date, '%Y-%m-%d') as formatted_due_date,
                DATE_FORMAT(i.paid_date, '%Y-%m-%d') as formatted_paid_date,
                DATE_FORMAT(i.created_at, '%Y-%m-%d %H:%i') as formatted_created_at
            FROM invoices i
            WHERE i.id = ?
        `, [id]);

        if (invoices.length === 0) {
            return res.status(404).json({ message: 'Invoice not found' });
        }

        const invoice = invoices[0];

        // Get items
        const [items] = await pool.query(`
            SELECT * FROM invoice_items 
            WHERE invoice_id = ? 
            ORDER BY sort_order ASC, id ASC
        `, [id]);
        invoice.items = items;

        // Get payment history
        const [payments] = await pool.query(`
            SELECT * FROM invoice_payments 
            WHERE invoice_id = ? 
            ORDER BY payment_date DESC
        `, [id]);
        invoice.payments = payments;

        // Mark as viewed if not already
        if (!invoice.viewed_at) {
            await pool.query(
                'UPDATE invoices SET viewed_at = NOW() WHERE id = ?',
                [id]
            );
            invoice.viewed_at = new Date();
        }

        res.json(invoice);
    } catch (error) {
        console.error('Error fetching invoice:', error);
        res.status(500).json({ 
            message: 'Error fetching invoice',
            error: error.message 
        });
    }
};

/**
 * GET /api/invoices/number/:invoiceNumber
 * Get invoice by invoice number
 */
const getInvoiceByNumber = async (req, res) => {
    try {
        const { invoiceNumber } = req.params;

        const [invoices] = await pool.query(`
            SELECT * FROM invoices WHERE invoice_number = ?
        `, [invoiceNumber]);

        if (invoices.length === 0) {
            return res.status(404).json({ message: 'Invoice not found' });
        }

        res.json(invoices[0]);
    } catch (error) {
        console.error('Error fetching invoice:', error);
        res.status(500).json({ message: 'Error fetching invoice' });
    }
};

/**
 * POST /api/invoices
 * Create a new invoice (from scratch or from quotation)
 */
const createInvoice = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const {
            // From quotation conversion
            quotation_id,
            quotation_reference,
            
            // Customer info
            customer_name,
            customer_email,
            customer_phone,
            customer_company,
            customer_address,
            customer_tax_id,
            
            // Invoice details
            issue_date = new Date(),
            due_date,
            payment_terms = 30,
            
            // Financial
            subtotal,
            tax_rate = 16.00,
            tax_amount,
            discount_type,
            discount_value = 0,
            shipping_amount = 0,
            total,
            
            // Items
            items = [],
            
            // Notes
            notes,
            terms_conditions,
            
            // Status
            status = 'draft'
        } = req.body;

        // Generate invoice number
        const invoiceNumber = generateInvoiceNumber();

        // Calculate dates
        const issueDate = new Date(issue_date);
        const dueDate = due_date || calculateDueDate(issueDate, payment_terms);

        // Calculate discount amount
        let discountAmount = 0;
        if (discount_type === 'percentage') {
            discountAmount = (subtotal * discount_value) / 100;
        } else if (discount_type === 'fixed') {
            discountAmount = discount_value;
        }

        // Calculate tax if not provided
        const calculatedTaxAmount = tax_amount || (subtotal - discountAmount + shippingAmount) * (tax_rate / 100);
        
        // Calculate total if not provided
        const calculatedTotal = total || (subtotal - discountAmount + shippingAmount + calculatedTaxAmount);
        
        // Calculate balance due
        const balanceDue = calculatedTotal;

        // Insert invoice
        const [result] = await connection.query(`
            INSERT INTO invoices (
                invoice_number, quotation_id, quotation_reference,
                status, payment_status,
                customer_name, customer_email, customer_phone,
                customer_company, customer_address, customer_tax_id,
                issue_date, due_date,
                subtotal, tax_rate, tax_amount,
                discount_type, discount_value, discount_amount,
                shipping_amount, total, amount_paid, balance_due,
                notes, terms_conditions, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            invoiceNumber, quotation_id || null, quotation_reference || null,
            status, 'unpaid',
            customer_name, customer_email, customer_phone || null,
            customer_company || null, customer_address || null, customer_tax_id || null,
            issueDate, dueDate,
            subtotal, tax_rate, calculatedTaxAmount,
            discount_type || null, discount_value || 0, discountAmount,
            shipping_amount, calculatedTotal, 0, balanceDue,
            notes || null, terms_conditions || null, req.user?.id || null
        ]);

        const invoiceId = result.insertId;

        // Insert invoice items
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            // Calculate item tax
            const itemTaxAmount = (item.unit_price * item.quantity) * (item.tax_rate || tax_rate) / 100;
            
            // Calculate item total
            const itemTotal = (item.unit_price * item.quantity) + itemTaxAmount;

            await connection.query(`
                INSERT INTO invoice_items (
                    invoice_id, product_id, quotation_item_id,
                    item_type, item_name, description,
                    quantity, unit, unit_price,
                    discount_percent, discount_amount,
                    tax_rate, tax_amount, total,
                    sort_order
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                invoiceId,
                item.product_id || null,
                item.quotation_item_id || null,
                item.item_type || 'product',
                item.item_name,
                item.description || null,
                item.quantity,
                item.unit || 'unit',
                item.unit_price,
                item.discount_percent || 0,
                item.discount_amount || 0,
                item.tax_rate || tax_rate,
                itemTaxAmount,
                itemTotal,
                i
            ]);
        }

        // If this invoice is created from a quotation, update the quotation status
        if (quotation_id) {
            await connection.query(`
                UPDATE quotations 
                SET status = 'converted', 
                    converted_at = NOW(),
                    converted_to_invoice_id = ?
                WHERE id = ?
            `, [invoiceId, quotation_id]);
        }

        await connection.commit();

        // Fetch and return the created invoice
        const [newInvoice] = await connection.query(
            'SELECT * FROM invoices WHERE id = ?',
            [invoiceId]
        );

        res.status(201).json({
            success: true,
            message: 'Invoice created successfully',
            invoice: newInvoice[0]
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error creating invoice:', error);
        res.status(500).json({ 
            message: 'Error creating invoice',
            error: error.message 
        });
    } finally {
        connection.release();
    }
};

/**
 * PUT /api/invoices/:id
 * Update invoice
 */
const updateInvoice = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const updates = req.body;

        // Check if invoice exists
        const [existing] = await connection.query(
            'SELECT * FROM invoices WHERE id = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ message: 'Invoice not found' });
        }

        const invoice = existing[0];

        // Don't allow updating paid invoices
        if (invoice.status === 'paid') {
            return res.status(400).json({ 
                message: 'Cannot update a paid invoice' 
            });
        }

        // Build update query dynamically
        const allowedFields = [
            'status', 'customer_name', 'customer_email', 'customer_phone',
            'customer_company', 'customer_address', 'customer_tax_id',
            'issue_date', 'due_date', 'subtotal', 'tax_rate', 'tax_amount',
            'discount_type', 'discount_value', 'discount_amount',
            'shipping_amount', 'total', 'notes', 'terms_conditions',
            'admin_notes'
        ];

        const updateFields = [];
        const updateValues = [];

        allowedFields.forEach(field => {
            if (updates[field] !== undefined) {
                updateFields.push(`${field} = ?`);
                updateValues.push(updates[field]);
            }
        });

        // Recalculate balance due if total or amount paid changed
        if (updates.total !== undefined || updates.amount_paid !== undefined) {
            const newTotal = updates.total !== undefined ? updates.total : invoice.total;
            const newAmountPaid = updates.amount_paid !== undefined ? updates.amount_paid : invoice.amount_paid;
            const newBalanceDue = newTotal - newAmountPaid;
            
            updateFields.push(`balance_due = ?`);
            updateValues.push(newBalanceDue);
            
            // Update payment status
            if (newBalanceDue <= 0) {
                updateFields.push(`payment_status = 'paid'`);
                updateFields.push(`paid_date = NOW()`);
                updateFields.push(`status = 'paid'`);
            } else if (newAmountPaid > 0) {
                updateFields.push(`payment_status = 'partial'`);
            }
        }

        if (updates.status === 'paid' && invoice.status !== 'paid') {
            updateFields.push(`paid_date = NOW()`);
            updateFields.push(`payment_status = 'paid'`);
            updateFields.push(`balance_due = 0`);
        }

        updateFields.push(`updated_at = NOW()`);
        updateValues.push(id);

        if (updateFields.length > 1) {
            await connection.query(
                `UPDATE invoices SET ${updateFields.join(', ')} WHERE id = ?`,
                updateValues
            );
        }

        // Update items if provided
        if (updates.items && Array.isArray(updates.items)) {
            // Delete existing items
            await connection.query(
                'DELETE FROM invoice_items WHERE invoice_id = ?',
                [id]
            );

            // Insert new items
            for (let i = 0; i < updates.items.length; i++) {
                const item = updates.items[i];
                
                const itemTaxAmount = (item.unit_price * item.quantity) * (item.tax_rate || invoice.tax_rate) / 100;
                const itemTotal = (item.unit_price * item.quantity) + itemTaxAmount;

                await connection.query(`
                    INSERT INTO invoice_items (
                        invoice_id, product_id, item_type, item_name,
                        description, quantity, unit, unit_price,
                        discount_percent, discount_amount,
                        tax_rate, tax_amount, total, sort_order
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    id,
                    item.product_id || null,
                    item.item_type || 'product',
                    item.item_name,
                    item.description || null,
                    item.quantity,
                    item.unit || 'unit',
                    item.unit_price,
                    item.discount_percent || 0,
                    item.discount_amount || 0,
                    item.tax_rate || invoice.tax_rate,
                    itemTaxAmount,
                    itemTotal,
                    i
                ]);
            }
        }

        await connection.commit();

        // Fetch and return updated invoice
        const [updatedInvoice] = await connection.query(
            'SELECT * FROM invoices WHERE id = ?',
            [id]
        );

        res.json({
            success: true,
            message: 'Invoice updated successfully',
            invoice: updatedInvoice[0]
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error updating invoice:', error);
        res.status(500).json({ 
            message: 'Error updating invoice',
            error: error.message 
        });
    } finally {
        connection.release();
    }
};

/**
 * DELETE /api/invoices/:id
 * Delete invoice (only drafts)
 */
const deleteInvoice = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if invoice exists and is draft
        const [invoice] = await pool.query(
            'SELECT status FROM invoices WHERE id = ?',
            [id]
        );

        if (invoice.length === 0) {
            return res.status(404).json({ message: 'Invoice not found' });
        }

        if (invoice[0].status !== 'draft') {
            return res.status(400).json({ 
                message: 'Only draft invoices can be deleted' 
            });
        }

        const [result] = await pool.query(
            'DELETE FROM invoices WHERE id = ?',
            [id]
        );

        res.json({ 
            success: true,
            message: 'Invoice deleted successfully' 
        });

    } catch (error) {
        console.error('Error deleting invoice:', error);
        res.status(500).json({ 
            message: 'Error deleting invoice',
            error: error.message 
        });
    }
};

// ==================== PAYMENT OPERATIONS ====================

/**
 * POST /api/invoices/:id/payments
 * Record a payment for an invoice
 */
const recordPayment = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const {
            payment_date,
            amount,
            payment_method,
            reference_number,
            notes
        } = req.body;

        // Get invoice
        const [invoices] = await connection.query(
            'SELECT * FROM invoices WHERE id = ?',
            [id]
        );

        if (invoices.length === 0) {
            return res.status(404).json({ message: 'Invoice not found' });
        }

        const invoice = invoices[0];

        // Check if payment amount is valid
        if (amount <= 0) {
            return res.status(400).json({ message: 'Payment amount must be greater than 0' });
        }

        if (amount > invoice.balance_due) {
            return res.status(400).json({ 
                message: 'Payment amount exceeds balance due' 
            });
        }

        // Record payment
        const [paymentResult] = await connection.query(`
            INSERT INTO invoice_payments (
                invoice_id, payment_date, amount,
                payment_method, reference_number, notes,
                received_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            id,
            payment_date || new Date(),
            amount,
            payment_method,
            reference_number || null,
            notes || null,
            req.user?.id || null
        ]);

        // Update invoice
        const newAmountPaid = invoice.amount_paid + amount;
        const newBalanceDue = invoice.total - newAmountPaid;
        
        let updateFields = 'amount_paid = ?, balance_due = ?';
        const updateValues = [newAmountPaid, newBalanceDue];

        if (newBalanceDue <= 0) {
            updateFields += ', payment_status = ?, status = ?, paid_date = ?';
            updateValues.push('paid', 'paid', payment_date || new Date());
        } else if (newAmountPaid > 0) {
            updateFields += ', payment_status = ?';
            updateValues.push('partial');
        }

        updateValues.push(id);

        await connection.query(
            `UPDATE invoices SET ${updateFields} WHERE id = ?`,
            updateValues
        );

        await connection.commit();

        res.json({
            success: true,
            message: 'Payment recorded successfully',
            payment: {
                id: paymentResult.insertId,
                amount,
                balance_due: newBalanceDue
            }
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error recording payment:', error);
        res.status(500).json({ 
            message: 'Error recording payment',
            error: error.message 
        });
    } finally {
        connection.release();
    }
};

/**
 * GET /api/invoices/:id/payments
 * Get payment history for an invoice
 */
const getPayments = async (req, res) => {
    try {
        const { id } = req.params;

        const [payments] = await pool.query(`
            SELECT 
                *,
                DATE_FORMAT(payment_date, '%Y-%m-%d') as formatted_payment_date,
                DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') as formatted_created_at
            FROM invoice_payments
            WHERE invoice_id = ?
            ORDER BY payment_date DESC
        `, [id]);

        res.json(payments);
    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).json({ 
            message: 'Error fetching payments',
            error: error.message 
        });
    }
};

// ==================== INVOICE ACTIONS ====================

/**
 * POST /api/invoices/:id/send
 * Mark invoice as sent
 */
const markAsSent = async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await pool.query(`
            UPDATE invoices 
            SET sent_at = NOW(), status = 'pending' 
            WHERE id = ? AND status = 'draft'
        `, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                message: 'Invoice not found or already sent' 
            });
        }

        res.json({ 
            success: true,
            message: 'Invoice marked as sent' 
        });

    } catch (error) {
        console.error('Error marking invoice as sent:', error);
        res.status(500).json({ 
            message: 'Error marking invoice as sent',
            error: error.message 
        });
    }
};

/**
 * POST /api/invoices/:id/mark-paid
 * Mark invoice as paid (full payment)
 */
const markAsPaid = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const { payment_method, reference_number, payment_date } = req.body;

        // Get invoice
        const [invoices] = await connection.query(
            'SELECT * FROM invoices WHERE id = ?',
            [id]
        );

        if (invoices.length === 0) {
            return res.status(404).json({ message: 'Invoice not found' });
        }

        const invoice = invoices[0];

        // Record full payment
        await connection.query(`
            INSERT INTO invoice_payments (
                invoice_id, payment_date, amount,
                payment_method, reference_number, notes,
                received_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            id,
            payment_date || new Date(),
            invoice.balance_due,
            payment_method || 'other',
            reference_number || null,
            'Full payment recorded',
            req.user?.id || null
        ]);

        // Update invoice status
        await connection.query(`
            UPDATE invoices 
            SET status = 'paid', 
                payment_status = 'paid',
                paid_date = ?,
                amount_paid = total,
                balance_due = 0,
                updated_at = NOW()
            WHERE id = ?
        `, [payment_date || new Date(), id]);

        await connection.commit();

        res.json({ 
            success: true,
            message: 'Invoice marked as paid' 
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error marking invoice as paid:', error);
        res.status(500).json({ 
            message: 'Error marking invoice as paid',
            error: error.message 
        });
    } finally {
        connection.release();
    }
};

/**
 * POST /api/invoices/:id/duplicate
 * Duplicate an invoice
 */
const duplicateInvoice = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;

        // Get original invoice
        const [invoices] = await connection.query(
            'SELECT * FROM invoices WHERE id = ?',
            [id]
        );

        if (invoices.length === 0) {
            return res.status(404).json({ message: 'Invoice not found' });
        }

        const original = invoices[0];

        // Generate new invoice number
        const newInvoiceNumber = generateInvoiceNumber();

        // Create duplicate
        const [result] = await connection.query(`
            INSERT INTO invoices (
                invoice_number, quotation_id, quotation_reference,
                status, payment_status,
                customer_name, customer_email, customer_phone,
                customer_company, customer_address, customer_tax_id,
                issue_date, due_date,
                subtotal, tax_rate, tax_amount,
                discount_type, discount_value, discount_amount,
                shipping_amount, total, amount_paid, balance_due,
                notes, terms_conditions, admin_notes
            ) SELECT 
                ?, NULL, CONCAT('Copy of ', invoice_number),
                'draft', 'unpaid',
                customer_name, customer_email, customer_phone,
                customer_company, customer_address, customer_tax_id,
                CURDATE(), DATE_ADD(CURDATE(), INTERVAL 30 DAY),
                subtotal, tax_rate, tax_amount,
                discount_type, discount_value, discount_amount,
                shipping_amount, total, 0, total,
                CONCAT('Duplicated from ', invoice_number, '\n\n', notes),
                terms_conditions, admin_notes
            FROM invoices WHERE id = ?
        `, [newInvoiceNumber, id]);

        const newInvoiceId = result.insertId;

        // Duplicate items
        await connection.query(`
            INSERT INTO invoice_items (
                invoice_id, product_id, item_type, item_name,
                description, quantity, unit, unit_price,
                discount_percent, discount_amount,
                tax_rate, tax_amount, total, sort_order
            )
            SELECT 
                ?, product_id, item_type, item_name,
                description, quantity, unit, unit_price,
                discount_percent, discount_amount,
                tax_rate, tax_amount, total, sort_order
            FROM invoice_items
            WHERE invoice_id = ?
        `, [newInvoiceId, id]);

        await connection.commit();

        const [newInvoice] = await connection.query(
            'SELECT * FROM invoices WHERE id = ?',
            [newInvoiceId]
        );

        res.json({
            success: true,
            message: 'Invoice duplicated successfully',
            invoice: newInvoice[0]
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error duplicating invoice:', error);
        res.status(500).json({ 
            message: 'Error duplicating invoice',
            error: error.message 
        });
    } finally {
        connection.release();
    }
};

// ==================== STATISTICS ====================

/**
 * GET /api/invoices/stats
 * Get invoice statistics
 */
const getInvoiceStats = async (req, res) => {
    try {
        const [stats] = await pool.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid,
                SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdue,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
                SUM(CASE WHEN due_date < CURDATE() AND status != 'paid' AND status != 'cancelled' THEN 1 ELSE 0 END) as overdue_calculated,
                SUM(total) as total_amount,
                SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END) as paid_amount,
                SUM(CASE WHEN status != 'paid' AND status != 'cancelled' THEN total ELSE 0 END) as outstanding_amount,
                SUM(balance_due) as total_balance_due,
                AVG(total) as average_invoice_value,
                MIN(issue_date) as first_invoice_date,
                MAX(issue_date) as latest_invoice_date
            FROM invoices
        `);

        // Get monthly totals for the last 6 months
        const [monthly] = await pool.query(`
            SELECT 
                DATE_FORMAT(issue_date, '%Y-%m') as month,
                COUNT(*) as count,
                SUM(total) as total
            FROM invoices
            WHERE issue_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
            GROUP BY DATE_FORMAT(issue_date, '%Y-%m')
            ORDER BY month DESC
        `);

        // Get top customers by revenue
        const [topCustomers] = await pool.query(`
            SELECT 
                customer_name,
                customer_email,
                COUNT(*) as invoice_count,
                SUM(total) as total_spent
            FROM invoices
            WHERE status = 'paid'
            GROUP BY customer_name, customer_email
            ORDER BY total_spent DESC
            LIMIT 5
        `);

        res.json({
            ...stats[0],
            monthly,
            top_customers: topCustomers
        });

    } catch (error) {
        console.error('Error fetching invoice stats:', error);
        res.status(500).json({ 
            message: 'Error fetching invoice statistics',
            error: error.message 
        });
    }
};

module.exports = {
    // CRUD
    getAllInvoices,
    getInvoiceById,
    getInvoiceByNumber,
    createInvoice,
    updateInvoice,
    deleteInvoice,
    
    // Payments
    recordPayment,
    getPayments,
    
    // Actions
    markAsSent,
    markAsPaid,
    duplicateInvoice,
    
    // Stats
    getInvoiceStats
};