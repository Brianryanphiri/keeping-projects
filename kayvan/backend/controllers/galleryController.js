const pool = require('../config/database');
const slugify = require('slugify');
const path = require('path');
const fs = require('fs').promises;

// Helper function to parse JSON fields
const parseJSONField = (field) => {
    if (!field) return [];
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

// ==================== PUBLIC ROUTES ====================

/**
 * GET /api/gallery/published
 * Get all published gallery items
 */
const getPublishedItems = async (req, res) => {
    try {
        const [items] = await pool.query(`
            SELECT 
                id,
                title,
                slug,
                description,
                type,
                media_url,
                thumbnail_url,
                video_url,
                video_duration,
                category,
                tags,
                views,
                likes_count,
                is_featured,
                project_id,
                created_at,
                DATE_FORMAT(created_at, '%Y-%m-%d') as date_added
            FROM gallery_items
            WHERE is_published = TRUE
            ORDER BY is_featured DESC, sort_order ASC, created_at DESC
        `);

        // Parse JSON fields
        const formattedItems = items.map(item => ({
            ...item,
            tags: parseJSONField(item.tags),
            views: item.views >= 1000 ? `${(item.views / 1000).toFixed(1)}K` : item.views.toString(),
            likes: item.likes_count >= 1000 ? `${(item.likes_count / 1000).toFixed(1)}K` : item.likes_count.toString(),
            date: getRelativeTime(item.created_at)
        }));

        res.json(formattedItems);
    } catch (error) {
        console.error('Error fetching gallery items:', error);
        res.status(500).json({ message: 'Error fetching gallery items', error: error.message });
    }
};

/**
 * GET /api/gallery/featured
 * Get featured gallery items
 */
const getFeaturedItems = async (req, res) => {
    try {
        const [items] = await pool.query(`
            SELECT 
                id,
                title,
                slug,
                description,
                type,
                thumbnail_url,
                video_duration,
                category,
                views,
                likes_count,
                DATE_FORMAT(created_at, '%Y-%m-%d') as date_added
            FROM gallery_items
            WHERE is_published = TRUE AND is_featured = TRUE
            ORDER BY sort_order ASC, created_at DESC
            LIMIT 6
        `);

        const formattedItems = items.map(item => ({
            ...item,
            views: item.views >= 1000 ? `${(item.views / 1000).toFixed(1)}K` : item.views.toString(),
            likes: item.likes_count >= 1000 ? `${(item.likes_count / 1000).toFixed(1)}K` : item.likes_count.toString(),
            date: getRelativeTime(item.created_at)
        }));

        res.json(formattedItems);
    } catch (error) {
        console.error('Error fetching featured items:', error);
        res.status(500).json({ message: 'Error fetching featured items' });
    }
};

/**
 * GET /api/gallery/item/:slug
 * Get single gallery item by slug
 */
const getItemBySlug = async (req, res) => {
    try {
        const { slug } = req.params;
        
        // Increment view count
        await pool.query(
            'UPDATE gallery_items SET views = views + 1 WHERE slug = ?',
            [slug]
        );

        const [items] = await pool.query(`
            SELECT 
                id,
                title,
                slug,
                description,
                type,
                media_url,
                thumbnail_url,
                video_url,
                video_duration,
                category,
                tags,
                views,
                likes_count,
                downloads,
                is_featured,
                project_id,
                created_at,
                updated_at,
                DATE_FORMAT(created_at, '%Y-%m-%d') as date_added
            FROM gallery_items
            WHERE slug = ? AND is_published = TRUE
        `, [slug]);

        if (items.length === 0) {
            return res.status(404).json({ message: 'Gallery item not found' });
        }

        const item = items[0];
        item.tags = parseJSONField(item.tags);
        item.views_formatted = item.views >= 1000 ? `${(item.views / 1000).toFixed(1)}K` : item.views.toString();
        item.likes_formatted = item.likes_count >= 1000 ? `${(item.likes_count / 1000).toFixed(1)}K` : item.likes_count.toString();

        res.json(item);
    } catch (error) {
        console.error('Error fetching gallery item:', error);
        res.status(500).json({ message: 'Error fetching gallery item' });
    }
};

/**
 * GET /api/gallery/categories
 * Get all categories with counts
 */
const getCategories = async (req, res) => {
    try {
        const [categories] = await pool.query(`
            SELECT 
                category,
                COUNT(*) as count,
                SUM(CASE WHEN type = 'video' THEN 1 ELSE 0 END) as video_count,
                SUM(CASE WHEN type = 'image' THEN 1 ELSE 0 END) as image_count
            FROM gallery_items
            WHERE is_published = TRUE
            GROUP BY category
            ORDER BY count DESC
        `);

        // Add "All" category with totals
        const [totals] = await pool.query(`
            SELECT 
                COUNT(*) as total_count,
                SUM(CASE WHEN type = 'video' THEN 1 ELSE 0 END) as total_videos,
                SUM(CASE WHEN type = 'image' THEN 1 ELSE 0 END) as total_images
            FROM gallery_items
            WHERE is_published = TRUE
        `);

        res.json({
            all: {
                category: 'All',
                count: totals[0].total_count,
                video_count: totals[0].total_videos,
                image_count: totals[0].total_images
            },
            categories
        });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ message: 'Error fetching categories' });
    }
};

/**
 * GET /api/gallery/stats
 * Get gallery statistics
 */
const getGalleryStats = async (req, res) => {
    try {
        const [stats] = await pool.query(`
            SELECT 
                COUNT(*) as total_items,
                SUM(CASE WHEN type = 'video' THEN 1 ELSE 0 END) as total_videos,
                SUM(CASE WHEN type = 'image' THEN 1 ELSE 0 END) as total_images,
                SUM(views) as total_views,
                SUM(likes_count) as total_likes,
                SUM(downloads) as total_downloads,
                AVG(views) as avg_views,
                COUNT(DISTINCT category) as total_categories
            FROM gallery_items
            WHERE is_published = TRUE
        `);

        const [recent] = await pool.query(`
            SELECT 
                id, title, type, thumbnail_url, views, likes_count,
                DATE_FORMAT(created_at, '%Y-%m-%d') as date_added
            FROM gallery_items
            WHERE is_published = TRUE
            ORDER BY created_at DESC
            LIMIT 5
        `);

        res.json({
            ...stats[0],
            recent_items: recent
        });
    } catch (error) {
        console.error('Error fetching gallery stats:', error);
        res.status(500).json({ message: 'Error fetching gallery stats' });
    }
};

/**
 * POST /api/gallery/:id/like
 * Like/unlike a gallery item
 */
const toggleLike = async (req, res) => {
    try {
        const { id } = req.params;
        const sessionId = req.headers['x-session-id'] || req.ip;
        
        // Check if already liked
        const [existing] = await pool.query(
            'SELECT id FROM gallery_likes WHERE gallery_id = ? AND session_id = ?',
            [id, sessionId]
        );

        if (existing.length > 0) {
            // Unlike
            await pool.query(
                'DELETE FROM gallery_likes WHERE gallery_id = ? AND session_id = ?',
                [id, sessionId]
            );
            await pool.query(
                'UPDATE gallery_items SET likes_count = likes_count - 1 WHERE id = ?',
                [id]
            );
            res.json({ liked: false });
        } else {
            // Like
            await pool.query(
                'INSERT INTO gallery_likes (gallery_id, session_id, user_ip) VALUES (?, ?, ?)',
                [id, sessionId, req.ip]
            );
            await pool.query(
                'UPDATE gallery_items SET likes_count = likes_count + 1 WHERE id = ?',
                [id]
            );
            res.json({ liked: true });
        }
    } catch (error) {
        console.error('Error toggling like:', error);
        res.status(500).json({ message: 'Error toggling like' });
    }
};

/**
 * GET /api/gallery/:id/like-status
 * Check if user has liked an item
 */
const getLikeStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const sessionId = req.headers['x-session-id'] || req.ip;
        
        const [existing] = await pool.query(
            'SELECT id FROM gallery_likes WHERE gallery_id = ? AND session_id = ?',
            [id, sessionId]
        );

        res.json({ liked: existing.length > 0 });
    } catch (error) {
        console.error('Error checking like status:', error);
        res.status(500).json({ message: 'Error checking like status' });
    }
};

/**
 * POST /api/gallery/:id/download
 * Increment download count
 */
const incrementDownload = async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.query(
            'UPDATE gallery_items SET downloads = downloads + 1 WHERE id = ?',
            [id]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Error incrementing download:', error);
        res.status(500).json({ message: 'Error incrementing download' });
    }
};

/**
 * GET /api/gallery/project/:projectId
 * Get gallery items by project ID
 */
const getItemsByProject = async (req, res) => {
    try {
        const { projectId } = req.params;
        
        const [items] = await pool.query(`
            SELECT 
                id,
                title,
                slug,
                description,
                type,
                thumbnail_url,
                media_url,
                category,
                created_at
            FROM gallery_items
            WHERE is_published = TRUE AND project_id = ?
            ORDER BY sort_order ASC, created_at DESC
        `, [projectId]);

        res.json(items);
    } catch (error) {
        console.error('Error fetching project gallery items:', error);
        res.status(500).json({ message: 'Error fetching project gallery items' });
    }
};

// ==================== ADMIN ROUTES ====================

/**
 * GET /api/gallery/admin
 * Get all gallery items (admin)
 */
const getAllItems = async (req, res) => {
    try {
        const [items] = await pool.query(`
            SELECT 
                g.*,
                p.title as project_title,
                (SELECT COUNT(*) FROM gallery_likes WHERE gallery_id = g.id) as actual_likes
            FROM gallery_items g
            LEFT JOIN projects p ON g.project_id = p.id
            ORDER BY g.created_at DESC
        `);

        const formattedItems = items.map(item => ({
            ...item,
            tags: parseJSONField(item.tags),
            views: item.views,
            likes_count: item.actual_likes || item.likes_count
        }));

        res.json(formattedItems);
    } catch (error) {
        console.error('Error fetching all gallery items:', error);
        res.status(500).json({ message: 'Error fetching gallery items' });
    }
};

/**
 * POST /api/gallery
 * Create new gallery item
 */
const createItem = async (req, res) => {
    try {
        const {
            title,
            description,
            type,
            media_url,
            thumbnail_url,
            video_url,
            video_duration,
            category,
            tags,
            is_featured,
            is_published,
            project_id,
            sort_order
        } = req.body;

        // Generate slug
        const slug = slugify(title, { lower: true, strict: true });

        // Check if slug exists
        const [existing] = await pool.query(
            'SELECT id FROM gallery_items WHERE slug = ?',
            [slug]
        );

        if (existing.length > 0) {
            return res.status(400).json({ message: 'Item with this slug already exists' });
        }

        const [result] = await pool.query(`
            INSERT INTO gallery_items (
                title, slug, description, type,
                media_url, thumbnail_url, video_url, video_duration,
                category, tags, is_featured, is_published, project_id, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            title, slug, description, type,
            media_url, thumbnail_url, video_url, video_duration,
            category, stringifyJSON(tags), is_featured || false, is_published || false, project_id || null, sort_order || 0
        ]);

        const [newItem] = await pool.query(
            'SELECT * FROM gallery_items WHERE id = ?',
            [result.insertId]
        );

        res.status(201).json(newItem[0]);
    } catch (error) {
        console.error('Error creating gallery item:', error);
        res.status(500).json({ message: 'Error creating gallery item', error: error.message });
    }
};

/**
 * PUT /api/gallery/:id
 * Update gallery item
 */
const updateItem = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Handle slug if title changed
        if (updates.title) {
            updates.slug = slugify(updates.title, { lower: true, strict: true });
        }

        // Handle JSON fields
        if (updates.tags) {
            updates.tags = stringifyJSON(updates.tags);
        }

        const [result] = await pool.query(
            'UPDATE gallery_items SET ? WHERE id = ?',
            [updates, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Gallery item not found' });
        }

        const [updated] = await pool.query(
            'SELECT * FROM gallery_items WHERE id = ?',
            [id]
        );

        res.json(updated[0]);
    } catch (error) {
        console.error('Error updating gallery item:', error);
        res.status(500).json({ message: 'Error updating gallery item' });
    }
};

/**
 * DELETE /api/gallery/:id
 * Delete gallery item
 */
const deleteItem = async (req, res) => {
    try {
        const { id } = req.params;
        
        const [result] = await pool.query(
            'DELETE FROM gallery_items WHERE id = ?',
            [id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Gallery item not found' });
        }
        
        res.json({ message: 'Gallery item deleted successfully' });
    } catch (error) {
        console.error('Error deleting gallery item:', error);
        res.status(500).json({ message: 'Error deleting gallery item' });
    }
};

/**
 * POST /api/gallery/upload
 * Upload gallery image
 */
const uploadImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No image file provided' });
        }

        const imageUrl = `/uploads/gallery/${req.file.filename}`;
        res.json({ 
            message: 'Image uploaded successfully',
            url: imageUrl 
        });
    } catch (error) {
        console.error('Error uploading image:', error);
        res.status(500).json({ message: 'Error uploading image' });
    }
};

/**
 * POST /api/gallery/bulk-update
 * Bulk update gallery items
 */
const bulkUpdateItems = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { itemIds, action, value } = req.body;

        if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
            return res.status(400).json({ message: 'No items selected' });
        }

        let updateField;
        switch (action) {
            case 'publish':
                updateField = 'is_published = ?';
                break;
            case 'feature':
                updateField = 'is_featured = ?';
                break;
            case 'delete':
                await connection.query(
                    'DELETE FROM gallery_items WHERE id IN (?)',
                    [itemIds]
                );
                await connection.commit();
                return res.json({ 
                    message: `${itemIds.length} items deleted successfully` 
                });
            default:
                throw new Error('Invalid bulk action');
        }

        await connection.query(
            `UPDATE gallery_items SET ${updateField} WHERE id IN (?)`,
            [value, itemIds]
        );

        await connection.commit();
        res.json({ 
            message: `${itemIds.length} items updated successfully` 
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error in bulk update:', error);
        res.status(500).json({ message: 'Error updating items' });
    } finally {
        connection.release();
    }
};

// Helper function to get relative time
const getRelativeTime = (date) => {
    const now = new Date();
    const diff = now - new Date(date);
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (years > 0) return `${years} year${years > 1 ? 's' : ''} ago`;
    if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`;
    if (weeks > 0) return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
};

module.exports = {
    // Public
    getPublishedItems,
    getFeaturedItems,
    getItemBySlug,
    getCategories,
    getGalleryStats,
    toggleLike,
    getLikeStatus,
    incrementDownload,
    getItemsByProject,
    
    // Admin
    getAllItems,
    createItem,
    updateItem,
    deleteItem,
    uploadImage,
    bulkUpdateItems
};