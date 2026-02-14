const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// Helper function to generate unique quotation ID
const generateQuotationId = () => {
    const prefix = 'KAY';
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}-${timestamp}${random}`;
};

// ==================== PUBLIC ROUTES ====================

/**
 * POST /api/quotations/public
 * Submit a new quotation from the public cart page
 */
const submitQuotation = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const {
            customer,
            items,
            subtotal,
            vat,
            total,
            notes
        } = req.body;

        // Validate required fields
        if (!customer?.name || !customer?.email) {
            return res.status(400).json({ 
                message: 'Customer name and email are required' 
            });
        }

        if (!items || items.length === 0) {
            return res.status(400).json({ 
                message: 'Quotation must have at least one item' 
            });
        }

        // Generate unique quotation ID
        const quotationId = generateQuotationId();
        
        // Calculate valid until date (30 days from now)
        const validUntil = new Date();
        validUntil.setDate(validUntil.getDate() + 30);

        // Insert quotation
        const [quotationResult] = await connection.query(`
            INSERT INTO quotations (
                quotation_id, status,
                customer_name, customer_email, customer_phone,
                customer_company, customer_project_name,
                customer_delivery_address, customer_notes,
                subtotal, vat, total, valid_until
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            quotationId, 'pending',
            customer.name, customer.email, customer.phone || null,
            customer.company || null, customer.projectName || null,
            customer.deliveryAddress || null, customer.notes || null,
            subtotal, vat, total, validUntil
        ]);

        const quotationDbId = quotationResult.insertId;

        // Insert quotation items
        for (const item of items) {
            await connection.query(`
                INSERT INTO quotation_items (
                    quotation_id, product_id, product_name, description,
                    quantity, unit, unit_price, total, is_service, category
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                quotationDbId,
                item.id || null,
                item.name,
                item.description || null,
                item.quantity,
                item.unit || 'unit',
                item.price,
                item.total,
                item.isService || false,
                item.category || null
            ]);
        }

        // Create notification for admin
        await connection.query(`
            INSERT INTO quotation_notifications (
                quotation_id, notification_type, is_read
            ) VALUES (?, 'new', false)
        `, [quotationDbId]);

        await connection.commit();

        res.status(201).json({
            success: true,
            message: 'Quotation submitted successfully',
            quotationId: quotationId,
            validUntil: validUntil
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error submitting quotation:', error);
        res.status(500).json({ 
            message: 'Error submitting quotation',
            error: error.message 
        });
    } finally {
        connection.release();
    }
};

/**
 * GET /api/quotations/track/:reference
 * Track a quotation by reference number
 */
const trackQuotation = async (req, res) => {
    try {
        const { reference } = req.params;

        const [quotations] = await pool.query(`
            SELECT 
                q.*,
                DATE_FORMAT(q.created_at, '%Y-%m-%d') as date,
                DATE_FORMAT(q.valid_until, '%Y-%m-%d') as valid_until_formatted,
                DATEDIFF(q.valid_until, NOW()) as days_remaining
            FROM quotations q
            WHERE q.quotation_id = ?
        `, [reference]);

        if (quotations.length === 0) {
            return res.status(404).json({ 
                message: 'Quotation not found' 
            });
        }

        const quotation = quotations[0];

        // Get items
        const [items] = await pool.query(`
            SELECT *
            FROM quotation_items
            WHERE quotation_id = ?
        `, [quotation.id]);

        res.json({
            ...quotation,
            items
        });

    } catch (error) {
        console.error('Error tracking quotation:', error);
        res.status(500).json({ 
            message: 'Error tracking quotation',
            error: error.message 
        });
    }
};

// ==================== ADMIN ROUTES ====================

/**
 * GET /api/quotations
 * Get all quotations with filters
 */
const getAllQuotations = async (req, res) => {
    try {
        const { status, search, from, to } = req.query;

        let query = `
            SELECT 
                q.*,
                COUNT(qi.id) as item_count,
                (SELECT COUNT(*) FROM quotation_notifications n 
                 WHERE n.quotation_id = q.id AND n.is_read = false) as unread_count,
                DATE_FORMAT(q.created_at, '%Y-%m-%d %H:%i') as formatted_date,
                DATE_FORMAT(q.valid_until, '%Y-%m-%d') as valid_until_formatted,
                DATEDIFF(q.valid_until, NOW()) as days_remaining
            FROM quotations q
            LEFT JOIN quotation_items qi ON q.id = qi.quotation_id
            WHERE 1=1
        `;

        const params = [];

        if (status && status !== 'all') {
            query += ` AND q.status = ?`;
            params.push(status);
        }

        if (search) {
            query += ` AND (
                q.quotation_id LIKE ? OR 
                q.customer_name LIKE ? OR 
                q.customer_email LIKE ? OR 
                q.customer_company LIKE ?
            )`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        if (from) {
            query += ` AND DATE(q.created_at) >= ?`;
            params.push(from);
        }

        if (to) {
            query += ` AND DATE(q.created_at) <= ?`;
            params.push(to);
        }

        query += ` GROUP BY q.id ORDER BY q.created_at DESC`;

        const [quotations] = await pool.query(query, params);

        // Get items for each quotation
        for (const quotation of quotations) {
            const [items] = await pool.query(`
                SELECT * FROM quotation_items WHERE quotation_id = ?
            `, [quotation.id]);
            quotation.items = items;
        }

        res.json(quotations);

    } catch (error) {
        console.error('Error fetching quotations:', error);
        res.status(500).json({ 
            message: 'Error fetching quotations',
            error: error.message 
        });
    }
};

/**
 * GET /api/quotations/:id
 * Get single quotation by ID
 */
const getQuotationById = async (req, res) => {
    try {
        const { id } = req.params;

        // Mark as viewed if it's pending
        await pool.query(`
            UPDATE quotations 
            SET status = 'viewed', viewed_at = NOW() 
            WHERE id = ? AND status = 'pending'
        `, [id]);

        // Add viewed notification
        await pool.query(`
            INSERT INTO quotation_notifications (quotation_id, notification_type, is_read)
            SELECT ?, 'viewed', false
            FROM DUAL
            WHERE NOT EXISTS (
                SELECT 1 FROM quotation_notifications 
                WHERE quotation_id = ? AND notification_type = 'viewed'
            )
        `, [id, id]);

        const [quotations] = await pool.query(`
            SELECT 
                q.*,
                DATE_FORMAT(q.created_at, '%Y-%m-%d %H:%i') as formatted_date,
                DATE_FORMAT(q.valid_until, '%Y-%m-%d') as valid_until_formatted,
                DATEDIFF(q.valid_until, NOW()) as days_remaining
            FROM quotations q
            WHERE q.id = ?
        `, [id]);

        if (quotations.length === 0) {
            return res.status(404).json({ message: 'Quotation not found' });
        }

        const quotation = quotations[0];

        // Get items
        const [items] = await pool.query(`
            SELECT * FROM quotation_items WHERE quotation_id = ?
        `, [id]);

        quotation.items = items;

        res.json(quotation);

    } catch (error) {
        console.error('Error fetching quotation:', error);
        res.status(500).json({ 
            message: 'Error fetching quotation',
            error: error.message 
        });
    }
};

/**
 * PUT /api/quotations/:id/status
 * Update quotation status
 */
const updateQuotationStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ['pending', 'viewed', 'processing', 'converted', 'expired', 'cancelled'];
        
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        let updateFields = 'status = ?';
        const params = [status];

        if (status === 'converted') {
            updateFields += ', converted_at = NOW()';
        }

        params.push(id);

        await pool.query(`
            UPDATE quotations 
            SET ${updateFields}
            WHERE id = ?
        `, params);

        // Create notification for status change
        if (status === 'converted') {
            await pool.query(`
                INSERT INTO quotation_notifications (quotation_id, notification_type, is_read)
                VALUES (?, 'converted', false)
            `, [id]);
        }

        res.json({ 
            success: true, 
            message: `Quotation status updated to ${status}` 
        });

    } catch (error) {
        console.error('Error updating quotation status:', error);
        res.status(500).json({ 
            message: 'Error updating quotation status',
            error: error.message 
        });
    }
};

/**
 * PUT /api/quotations/:id/notes
 * Update admin notes
 */
const updateQuotationNotes = async (req, res) => {
    try {
        const { id } = req.params;
        const { admin_notes } = req.body;

        await pool.query(`
            UPDATE quotations 
            SET admin_notes = ?
            WHERE id = ?
        `, [admin_notes, id]);

        res.json({ 
            success: true, 
            message: 'Notes updated successfully' 
        });

    } catch (error) {
        console.error('Error updating notes:', error);
        res.status(500).json({ 
            message: 'Error updating notes',
            error: error.message 
        });
    }
};

/**
 * POST /api/quotations/:id/convert-to-invoice
 * Convert quotation to invoice
 */
const convertToInvoice = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const { invoice_number } = req.body;

        // Get quotation details
        const [quotations] = await connection.query(`
            SELECT * FROM quotations WHERE id = ?
        `, [id]);

        if (quotations.length === 0) {
            return res.status(404).json({ message: 'Quotation not found' });
        }

        const quotation = quotations[0];

        // Get quotation items
        const [items] = await connection.query(`
            SELECT * FROM quotation_items WHERE quotation_id = ?
        `, [id]);

        // TODO: Insert into invoices table (you'll create this)
        const invoiceId = 'INV-' + Date.now().toString().slice(-8);

        // Update quotation status
        await connection.query(`
            UPDATE quotations 
            SET status = 'converted', 
                converted_at = NOW(),
                converted_to_invoice_id = ?
            WHERE id = ?
        `, [invoiceId, id]);

        // Create converted notification
        await connection.query(`
            INSERT INTO quotation_notifications (quotation_id, notification_type, is_read)
            VALUES (?, 'converted', false)
        `, [id]);

        await connection.commit();

        res.json({
            success: true,
            message: 'Quotation converted to invoice successfully',
            invoice_id: invoiceId
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error converting quotation:', error);
        res.status(500).json({ 
            message: 'Error converting quotation',
            error: error.message 
        });
    } finally {
        connection.release();
    }
};

/**
 * DELETE /api/quotations/:id
 * Delete quotation
 */
const deleteQuotation = async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await pool.query(`
            DELETE FROM quotations WHERE id = ?
        `, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Quotation not found' });
        }

        res.json({ 
            success: true, 
            message: 'Quotation deleted successfully' 
        });

    } catch (error) {
        console.error('Error deleting quotation:', error);
        res.status(500).json({ 
            message: 'Error deleting quotation',
            error: error.message 
        });
    }
};

// ==================== NOTIFICATIONS ====================

/**
 * GET /api/quotations/notifications
 * Get all notifications
 */
const getNotifications = async (req, res) => {
    try {
        const [notifications] = await pool.query(`
            SELECT 
                n.*,
                q.quotation_id,
                q.customer_name,
                q.total,
                DATE_FORMAT(n.created_at, '%Y-%m-%d %H:%i') as formatted_date
            FROM quotation_notifications n
            JOIN quotations q ON n.quotation_id = q.id
            ORDER BY n.created_at DESC
            LIMIT 50
        `);

        // Get unread count
        const [unreadCount] = await pool.query(`
            SELECT COUNT(*) as count
            FROM quotation_notifications
            WHERE is_read = false
        `);

        res.json({
            notifications,
            unread_count: unreadCount[0].count
        });

    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ 
            message: 'Error fetching notifications',
            error: error.message 
        });
    }
};

/**
 * POST /api/quotations/notifications/:id/read
 * Mark notification as read
 */
const markNotificationRead = async (req, res) => {
    try {
        const { id } = req.params;

        await pool.query(`
            UPDATE quotation_notifications 
            SET is_read = true 
            WHERE id = ?
        `, [id]);

        res.json({ success: true });

    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ 
            message: 'Error marking notification as read',
            error: error.message 
        });
    }
};

/**
 * POST /api/quotations/notifications/read-all
 * Mark all notifications as read
 */
const markAllNotificationsRead = async (req, res) => {
    try {
        await pool.query(`
            UPDATE quotation_notifications 
            SET is_read = true 
            WHERE is_read = false
        `);

        res.json({ 
            success: true,
            message: 'All notifications marked as read' 
        });

    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ 
            message: 'Error marking all notifications as read',
            error: error.message 
        });
    }
};

module.exports = {
    // Public
    submitQuotation,
    trackQuotation,
    
    // Admin
    getAllQuotations,
    getQuotationById,
    updateQuotationStatus,
    updateQuotationNotes,
    convertToInvoice,
    deleteQuotation,
    
    // Notifications
    getNotifications,
    markNotificationRead,
    markAllNotificationsRead
};