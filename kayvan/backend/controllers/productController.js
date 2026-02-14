const pool = require('../config/database');
const slugify = require('slugify');
const path = require('path');
const fs = require('fs').promises;

// Helper function to parse JSON fields
const parseJSONField = (field) => {
    if (!field) return null;
    try {
        return typeof field === 'string' ? JSON.parse(field) : field;
    } catch {
        return field;
    }
};

// Helper function to stringify JSON for MySQL
const stringifyJSON = (field) => {
    if (!field) return null;
    return typeof field === 'string' ? field : JSON.stringify(field);
};

// Get all products (admin)
const getProducts = async (req, res) => {
  try {
    const [products] = await pool.query(`
      SELECT 
        p.*,
        COUNT(DISTINCT pg.id) as gallery_count
      FROM products p
      LEFT JOIN product_gallery_images pg ON p.id = pg.product_id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `);

    // Parse JSON fields
    const parsedProducts = products.map(product => ({
      ...product,
      gallery_images: product.gallery_images ? parseJSONField(product.gallery_images) : [],
      features: product.features ? parseJSONField(product.features) : [],
      applications: product.applications ? parseJSONField(product.applications) : [],
      technical_specs: product.technical_specs ? parseJSONField(product.technical_specs) : {},
      related_products: product.related_products ? parseJSONField(product.related_products) : [],
      variants: product.variants ? parseJSONField(product.variants) : [],
      seo_keywords: product.seo_keywords ? parseJSONField(product.seo_keywords) : []
    }));

    res.json(parsedProducts);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get published products (public)
const getPublishedProducts = async (req, res) => {
  try {
    const [products] = await pool.query(`
      SELECT 
        p.id,
        p.name,
        p.slug,
        p.short_description,
        p.description,
        p.category,
        p.price,
        p.compare_at_price,
        p.sku,
        p.stock_quantity,
        p.stock_status,
        p.image_url,
        p.features,
        p.applications,
        p.is_featured,
        p.rating,
        p.review_count,
        p.created_at
      FROM products p
      WHERE p.is_published = true 
        AND p.stock_status != 'out_of_stock'
      ORDER BY 
        p.is_featured DESC,
        p.created_at DESC
    `);

    // Parse JSON fields
    const parsedProducts = products.map(product => ({
      ...product,
      features: product.features ? parseJSONField(product.features) : [],
      applications: product.applications ? parseJSONField(product.applications) : []
    }));

    res.json(parsedProducts);
  } catch (error) {
    console.error('Error fetching published products:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get single product by id or slug (public)
const getProduct = async (req, res) => {
  try {
    const [products] = await pool.query(
      `SELECT 
        p.*,
        GROUP_CONCAT(pg.image_url ORDER BY pg.sort_order) as gallery_images_list
      FROM products p
      LEFT JOIN product_gallery_images pg ON p.id = pg.product_id
      WHERE (p.id = ? OR p.slug = ?) AND p.is_published = true
      GROUP BY p.id`,
      [req.params.id, req.params.id]
    );
    
    if (products.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    const product = products[0];
    
    // Parse JSON fields
    const parsedProduct = {
      ...product,
      gallery_images: product.gallery_images_list 
        ? product.gallery_images_list.split(',') 
        : (product.gallery_images ? parseJSONField(product.gallery_images) : []),
      features: product.features ? parseJSONField(product.features) : [],
      applications: product.applications ? parseJSONField(product.applications) : [],
      technical_specs: product.technical_specs ? parseJSONField(product.technical_specs) : {},
      related_products: product.related_products ? parseJSONField(product.related_products) : [],
      variants: product.variants ? parseJSONField(product.variants) : [],
      seo_keywords: product.seo_keywords ? parseJSONField(product.seo_keywords) : [],
      gallery_images_list: undefined
    };
    
    res.json(parsedProduct);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get product by slug (public)
const getProductBySlug = async (req, res) => {
  try {
    const [products] = await pool.query(
      `SELECT * FROM products WHERE slug = ? AND is_published = true`,
      [req.params.slug]
    );
    
    if (products.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    res.json(products[0]);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create new product
const createProduct = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      name,
      short_description,
      description,
      category,
      price,
      compare_at_price,
      cost_per_item,
      sku,
      barcode,
      stock_quantity,
      stock_status,
      image_url,
      gallery_images,
      is_published,
      is_featured,
      is_taxable,
      tax_rate,
      weight,
      weight_unit,
      dimensions,
      features,
      applications,
      technical_specs,
      meta_title,
      meta_description,
      meta_keywords,
      seo_slug
    } = req.body;

    // Generate slug if not provided
    const slug = seo_slug || slugify(name, { lower: true, strict: true });

    // Check if slug exists
    const [existing] = await connection.query(
      'SELECT id FROM products WHERE slug = ?',
      [slug]
    );

    if (existing.length > 0) {
      throw new Error('Product with this slug already exists');
    }

    // Generate SKU if not provided
    const productSku = sku || `${category?.substring(0, 3).toUpperCase() || 'PRD'}-${Date.now().toString().slice(-6)}`;

    // Insert product
    const [result] = await connection.query(
      `INSERT INTO products (
        name, slug, short_description, description,
        category, price, compare_at_price, cost_per_item,
        sku, barcode, stock_quantity, stock_status,
        image_url, is_published, is_featured, is_taxable, tax_rate,
        weight, weight_unit, dimensions,
        features, applications, technical_specs,
        meta_title, meta_description, meta_keywords,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        name, slug, short_description, description,
        category, price || 0, compare_at_price || null, cost_per_item || null,
        productSku, barcode || null, stock_quantity || 0, stock_status || 'in_stock',
        image_url || null, is_published || false, is_featured || false, is_taxable !== false, tax_rate || 0,
        weight || null, weight_unit || 'kg', dimensions ? JSON.stringify(dimensions) : null,
        stringifyJSON(features), stringifyJSON(applications), stringifyJSON(technical_specs),
        meta_title || null, meta_description || null, meta_keywords || null
      ]
    );

    const productId = result.insertId;

    // Insert gallery images
    if (gallery_images && Array.isArray(gallery_images)) {
      for (let i = 0; i < gallery_images.length; i++) {
        await connection.query(
          `INSERT INTO product_gallery_images (product_id, image_url, sort_order) VALUES (?, ?, ?)`,
          [productId, gallery_images[i], i]
        );
      }
    }

    await connection.commit();

    // Fetch and return the created product
    const [newProduct] = await connection.query(
      'SELECT * FROM products WHERE id = ?',
      [productId]
    );

    res.status(201).json({
      message: 'Product created successfully',
      product: newProduct[0]
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error creating product:', error);
    res.status(500).json({ 
      message: 'Error creating product', 
      error: error.message 
    });
  } finally {
    connection.release();
  }
};

// Update product
const updateProduct = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const updates = req.body;

    // Check if product exists
    const [existing] = await connection.query(
      'SELECT * FROM products WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Handle slug uniqueness if changing
    let slug = existing[0].slug;
    if (updates.name && !updates.seo_slug) {
      slug = slugify(updates.name, { lower: true, strict: true });
    } else if (updates.seo_slug) {
      slug = updates.seo_slug;
    }

    if (slug !== existing[0].slug) {
      const [slugCheck] = await connection.query(
        'SELECT id FROM products WHERE slug = ? AND id != ?',
        [slug, id]
      );
      if (slugCheck.length > 0) {
        throw new Error('Product with this slug already exists');
      }
    }

    // Build update query dynamically
    const allowedFields = [
      'name', 'short_description', 'description',
      'category', 'price', 'compare_at_price', 'cost_per_item',
      'sku', 'barcode', 'stock_quantity', 'stock_status',
      'image_url', 'is_published', 'is_featured', 'is_taxable', 'tax_rate',
      'weight', 'weight_unit',
      'features', 'applications', 'technical_specs',
      'meta_title', 'meta_description', 'meta_keywords'
    ];

    const updateFields = ['slug = ?'];
    const updateValues = [slug];

    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        if (['features', 'applications', 'technical_specs'].includes(field)) {
          updateFields.push(`${field} = ?`);
          updateValues.push(stringifyJSON(updates[field]));
        } else {
          updateFields.push(`${field} = ?`);
          updateValues.push(updates[field]);
        }
      }
    });

    // Handle dimensions separately
    if (updates.dimensions !== undefined) {
      updateFields.push(`dimensions = ?`);
      updateValues.push(JSON.stringify(updates.dimensions));
    }

    updateFields.push('updated_at = NOW()');
    updateValues.push(id);

    if (updateFields.length > 1) { // More than just slug
      await connection.query(
        `UPDATE products SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
    }

    // Update gallery images if provided
    if (updates.gallery_images && Array.isArray(updates.gallery_images)) {
      // Delete existing gallery images
      await connection.query(
        'DELETE FROM product_gallery_images WHERE product_id = ?',
        [id]
      );

      // Insert new gallery images
      for (let i = 0; i < updates.gallery_images.length; i++) {
        await connection.query(
          `INSERT INTO product_gallery_images (product_id, image_url, sort_order) VALUES (?, ?, ?)`,
          [id, updates.gallery_images[i], i]
        );
      }
    }

    await connection.commit();

    // Fetch and return updated product
    const [updatedProduct] = await connection.query(
      `SELECT 
        p.*,
        GROUP_CONCAT(pg.image_url ORDER BY pg.sort_order) as gallery_images_list
      FROM products p
      LEFT JOIN product_gallery_images pg ON p.id = pg.product_id
      WHERE p.id = ?
      GROUP BY p.id`,
      [id]
    );

    res.json({
      message: 'Product updated successfully',
      product: updatedProduct[0]
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error updating product:', error);
    res.status(500).json({ 
      message: 'Error updating product', 
      error: error.message 
    });
  } finally {
    connection.release();
  }
};

// Delete product
const deleteProduct = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // Get product to delete images
    const [product] = await connection.query(
      'SELECT image_url FROM products WHERE id = ?',
      [id]
    );

    if (product.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Delete product (cascade will handle gallery images)
    await connection.query('DELETE FROM products WHERE id = ?', [id]);

    await connection.commit();
    res.json({ message: 'Product deleted successfully' });

  } catch (error) {
    await connection.rollback();
    console.error('Error deleting product:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message 
    });
  } finally {
    connection.release();
  }
};

// Upload product image
const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    const imageUrl = `/uploads/products/${req.file.filename}`;
    res.json({ 
      message: 'Image uploaded successfully',
      url: imageUrl 
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ 
      message: 'Error uploading image', 
      error: error.message 
    });
  }
};

// Bulk update products
const bulkUpdateProducts = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { productIds, action, value } = req.body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ message: 'No products selected' });
    }

    let updateField;
    switch (action) {
      case 'publish':
        updateField = 'is_published = ?';
        break;
      case 'feature':
        updateField = 'is_featured = ?';
        break;
      case 'stock_status':
        updateField = 'stock_status = ?';
        break;
      case 'delete':
        await connection.query(
          'DELETE FROM products WHERE id IN (?)',
          [productIds]
        );
        await connection.commit();
        return res.json({ 
          message: `${productIds.length} products deleted successfully` 
        });
      default:
        throw new Error('Invalid bulk action');
    }

    await connection.query(
      `UPDATE products SET ${updateField} WHERE id IN (?)`,
      [value, productIds]
    );

    await connection.commit();
    res.json({ 
      message: `${productIds.length} products updated successfully` 
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error in bulk update:', error);
    res.status(500).json({ 
      message: 'Error updating products', 
      error: error.message 
    });
  } finally {
    connection.release();
  }
};

// Get featured products
const getFeaturedProducts = async (req, res) => {
  try {
    const [products] = await pool.query(
      `SELECT 
        id, name, slug, short_description, image_url,
        category, price, rating, review_count
      FROM products
      WHERE is_published = true AND is_featured = true AND stock_status != 'out_of_stock'
      ORDER BY created_at DESC
      LIMIT 8`
    );

    res.json(products);
  } catch (error) {
    console.error('Error fetching featured products:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get products by category
const getProductsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    
    const [products] = await pool.query(
      `SELECT 
        id, name, slug, short_description, image_url,
        price, compare_at_price, rating, review_count,
        is_featured, stock_status
      FROM products
      WHERE is_published = true AND category = ? AND stock_status != 'out_of_stock'
      ORDER BY is_featured DESC, created_at DESC`,
      [category]
    );

    res.json(products);
  } catch (error) {
    console.error('Error fetching products by category:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Check product stock
const checkStock = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [products] = await pool.query(
      'SELECT stock_quantity, stock_status, sku FROM products WHERE id = ?',
      [id]
    );

    if (products.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json(products[0]);
  } catch (error) {
    console.error('Error checking stock:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get product statistics (admin)
const getProductStats = async (req, res) => {
  try {
    const [stats] = await pool.query(`
      SELECT 
        COUNT(*) as total_products,
        SUM(CASE WHEN is_published = true THEN 1 ELSE 0 END) as published_products,
        SUM(CASE WHEN is_featured = true THEN 1 ELSE 0 END) as featured_products,
        SUM(CASE WHEN stock_status = 'out_of_stock' THEN 1 ELSE 0 END) as out_of_stock_products,
        COUNT(DISTINCT category) as total_categories,
        AVG(price) as average_price,
        MIN(price) as min_price,
        MAX(price) as max_price,
        SUM(stock_quantity) as total_inventory
      FROM products
    `);

    // Get products by category
    const [byCategory] = await pool.query(`
      SELECT 
        category,
        COUNT(*) as count,
        AVG(price) as avg_price,
        SUM(stock_quantity) as total_stock
      FROM products
      WHERE is_published = true
      GROUP BY category
      ORDER BY count DESC
    `);

    // Get recent products
    const [recent] = await pool.query(`
      SELECT id, name, slug, price, is_published, created_at
      FROM products
      ORDER BY created_at DESC
      LIMIT 5
    `);

    res.json({
      ...stats[0],
      by_category: byCategory,
      recent_products: recent
    });
  } catch (error) {
    console.error('Error fetching product stats:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  getProducts,
  getPublishedProducts,
  getProduct,
  getProductBySlug,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadImage,
  bulkUpdateProducts,
  getFeaturedProducts,
  getProductsByCategory,
  checkStock,
  getProductStats
};