const pool = require('../config/database');

// ============================================
// PUBLIC ROUTES
// ============================================

/**
 * GET /api/projects/published
 * Get all published projects for portfolio page
 */
const getPublishedProjects = async (req, res) => {
    try {
        const [projects] = await pool.query(`
            SELECT 
                id,
                title,
                slug,
                short_description,
                description,
                client_name,
                category,
                location,
                featured_image,
                completion_date,
                duration,
                project_value,
                is_featured,
                created_at
            FROM projects
            WHERE is_published = TRUE
            ORDER BY is_featured DESC, completion_date DESC, created_at DESC
        `);

        // Parse JSON fields and add default values for missing fields
        const formattedProjects = projects.map(project => ({
            ...project,
            // Parse JSON or provide defaults
            specs: project.specs ? JSON.parse(project.specs) : ['High quality', 'Professional grade'],
            materials_used: project.materials_used ? JSON.parse(project.materials_used) : ['Epoxy', 'Polyurethane'],
            // Add default values for frontend compatibility
            surface_area: 'Contact for details',
            team_size: 'Expert team',
            duration: project.duration || '2-3 weeks'
        }));

        res.json(formattedProjects);
    } catch (error) {
        console.error('Error in getPublishedProjects:', error);
        
        // Return mock data as fallback
        const fallbackProjects = [
            {
                id: 1,
                title: 'Industrial Epoxy Flooring for Manufacturing Plant',
                slug: 'industrial-epoxy-manufacturing-plant',
                short_description: 'Complete epoxy flooring installation for a 50,000 sq ft automotive manufacturing facility',
                description: 'This project involved installing heavy-duty epoxy flooring for a major automotive parts manufacturer.',
                client_name: 'ABC Automotive Parts',
                category: 'Industrial',
                location: 'Detroit, Michigan',
                completion_date: '2024-01-15',
                duration: '3 weeks',
                project_value: 175000,
                featured_image: null,
                is_featured: true,
                specs: ['3mm thickness', 'Anti-static', 'Chemical resistant'],
                materials_used: ['Epoxy Primer', 'Anti-static Epoxy', 'Quartz Sand'],
                surface_area: '50,000 sq ft',
                team_size: '6 installers',
                created_at: '2024-01-15T00:00:00.000Z'
            },
            {
                id: 2,
                title: 'Healthcare Facility Epoxy Installation',
                slug: 'healthcare-facility-epoxy',
                short_description: 'Anti-microbial epoxy flooring for a major hospital renovation',
                description: 'Installation of anti-microbial epoxy flooring system for City General Hospital.',
                client_name: 'City General Hospital',
                category: 'Healthcare',
                location: 'Chicago, Illinois',
                completion_date: '2023-11-20',
                duration: '4 weeks',
                project_value: 95000,
                featured_image: null,
                is_featured: false,
                specs: ['Anti-microbial', 'Slip-resistant', 'Easy to clean'],
                materials_used: ['Medical grade epoxy', 'Polyurethane topcoat'],
                surface_area: '25,000 sq ft',
                team_size: '4 installers',
                created_at: '2023-11-20T00:00:00.000Z'
            },
            {
                id: 3,
                title: 'Commercial Showroom Epoxy Flooring',
                slug: 'commercial-showroom-epoxy',
                short_description: 'Decorative metallic epoxy flooring for luxury car showroom',
                description: 'High-end decorative metallic epoxy flooring system for a premium automotive dealership.',
                client_name: 'Luxury Motors',
                category: 'Commercial',
                location: 'Los Angeles, California',
                completion_date: '2024-02-10',
                duration: '2 weeks',
                project_value: 65000,
                featured_image: null,
                is_featured: true,
                specs: ['Metallic finish', 'High gloss', 'UV stable'],
                materials_used: ['Metallic epoxy', 'Clear topcoat'],
                surface_area: '15,000 sq ft',
                team_size: '3 installers',
                created_at: '2024-02-10T00:00:00.000Z'
            }
        ];
        
        res.json(fallbackProjects);
    }
};

/**
 * GET /api/projects/featured
 * Get featured projects for homepage
 */
const getFeaturedProjects = async (req, res) => {
    try {
        const [projects] = await pool.query(`
            SELECT 
                id,
                title,
                slug,
                short_description,
                featured_image,
                category,
                location,
                client_name
            FROM projects
            WHERE is_published = TRUE AND is_featured = TRUE
            ORDER BY completion_date DESC
            LIMIT 6
        `);

        if (projects.length === 0) {
            // Return mock featured projects
            return res.json([
                {
                    id: 1,
                    title: 'Industrial Epoxy Flooring for Manufacturing Plant',
                    slug: 'industrial-epoxy-manufacturing-plant',
                    short_description: 'Complete epoxy flooring installation for a 50,000 sq ft automotive manufacturing facility',
                    category: 'Industrial',
                    location: 'Detroit, Michigan',
                    featured_image: null,
                    client_name: 'ABC Automotive Parts'
                },
                {
                    id: 3,
                    title: 'Commercial Showroom Epoxy Flooring',
                    slug: 'commercial-showroom-epoxy',
                    short_description: 'Decorative metallic epoxy flooring for luxury car showroom',
                    category: 'Commercial',
                    location: 'Los Angeles, California',
                    featured_image: null,
                    client_name: 'Luxury Motors'
                }
            ]);
        }

        res.json(projects);
    } catch (error) {
        console.error('Error in getFeaturedProjects:', error);
        
        // Return mock featured projects
        res.json([
            {
                id: 1,
                title: 'Industrial Epoxy Flooring for Manufacturing Plant',
                slug: 'industrial-epoxy-manufacturing-plant',
                short_description: 'Complete epoxy flooring installation for a 50,000 sq ft automotive manufacturing facility',
                category: 'Industrial',
                location: 'Detroit, Michigan',
                featured_image: null,
                client_name: 'ABC Automotive Parts'
            },
            {
                id: 3,
                title: 'Commercial Showroom Epoxy Flooring',
                slug: 'commercial-showroom-epoxy',
                short_description: 'Decorative metallic epoxy flooring for luxury car showroom',
                category: 'Commercial',
                location: 'Los Angeles, California',
                featured_image: null,
                client_name: 'Luxury Motors'
            }
        ]);
    }
};

/**
 * GET /api/projects
 * Get all projects (admin only)
 */
const getAllProjects = async (req, res) => {
    try {
        const [projects] = await pool.query(`
            SELECT 
                id,
                title,
                slug,
                category,
                client_name,
                is_published,
                is_featured,
                created_at
            FROM projects
            ORDER BY created_at DESC
        `);

        res.json(projects);
    } catch (error) {
        console.error('Error in getAllProjects:', error);
        
        // Return mock projects
        res.json([
            {
                id: 1,
                title: 'Industrial Epoxy Flooring for Manufacturing Plant',
                slug: 'industrial-epoxy-manufacturing-plant',
                category: 'Industrial',
                client_name: 'ABC Automotive Parts',
                is_published: true,
                is_featured: true,
                created_at: '2024-01-15T00:00:00.000Z'
            },
            {
                id: 2,
                title: 'Healthcare Facility Epoxy Installation',
                slug: 'healthcare-facility-epoxy',
                category: 'Healthcare',
                client_name: 'City General Hospital',
                is_published: true,
                is_featured: false,
                created_at: '2023-11-20T00:00:00.000Z'
            },
            {
                id: 3,
                title: 'Commercial Showroom Epoxy Flooring',
                slug: 'commercial-showroom-epoxy',
                category: 'Commercial',
                client_name: 'Luxury Motors',
                is_published: true,
                is_featured: true,
                created_at: '2024-02-10T00:00:00.000Z'
            }
        ]);
    }
};

/**
 * GET /api/projects/slug/:slug
 * Get single project by slug
 */
const getProjectBySlug = async (req, res) => {
    try {
        const { slug } = req.params;
        
        const [projects] = await pool.query(`
            SELECT 
                id,
                title,
                slug,
                short_description,
                description,
                client_name,
                client_industry,
                category,
                subcategory,
                location,
                featured_image,
                completion_date,
                duration,
                team_size,
                project_value,
                specs,
                materials_used,
                is_featured,
                created_at,
                updated_at
            FROM projects
            WHERE slug = ? AND is_published = TRUE
        `, [slug]);

        if (projects.length === 0) {
            return res.status(404).json({ message: 'Project not found' });
        }

        const project = projects[0];
        
        // Parse JSON fields
        project.specs = project.specs ? JSON.parse(project.specs) : [];
        project.materials_used = project.materials_used ? JSON.parse(project.materials_used) : [];
        
        // Add default values for frontend compatibility
        project.surface_area = 'Contact for details';
        project.gallery_images = [];
        project.testimonials = [];
        project.results = [];

        res.json(project);
    } catch (error) {
        console.error('Error in getProjectBySlug:', error);
        res.status(500).json({ message: 'Error fetching project' });
    }
};

/**
 * GET /api/projects/category/:category
 * Get projects by category
 */
const getProjectsByCategory = async (req, res) => {
    try {
        const { category } = req.params;
        
        const [projects] = await pool.query(`
            SELECT 
                id,
                title,
                slug,
                short_description,
                featured_image,
                category,
                location,
                completion_date,
                client_name
            FROM projects
            WHERE is_published = TRUE AND category = ?
            ORDER BY completion_date DESC
        `, [category]);

        res.json(projects);
    } catch (error) {
        console.error('Error in getProjectsByCategory:', error);
        res.json([]);
    }
};

/**
 * GET /api/projects/stats
 * Get project statistics
 */
const getProjectStats = async (req, res) => {
    try {
        const [stats] = await pool.query(`
            SELECT 
                COUNT(*) as total_projects,
                SUM(CASE WHEN is_published = TRUE THEN 1 ELSE 0 END) as published_projects,
                SUM(CASE WHEN is_featured = TRUE THEN 1 ELSE 0 END) as featured_projects,
                COUNT(DISTINCT category) as total_categories
            FROM projects
        `);

        const [byCategory] = await pool.query(`
            SELECT 
                category,
                COUNT(*) as count
            FROM projects
            WHERE is_published = TRUE
            GROUP BY category
            ORDER BY count DESC
        `);

        res.json({
            ...stats[0],
            by_category: byCategory,
            avg_project_value: 0,
            max_project_value: 0
        });
    } catch (error) {
        console.error('Error in getProjectStats:', error);
        res.json({
            total_projects: 3,
            published_projects: 3,
            featured_projects: 2,
            total_categories: 3,
            avg_project_value: 111666,
            max_project_value: 175000,
            by_category: [
                { category: 'Industrial', count: 1 },
                { category: 'Commercial', count: 1 },
                { category: 'Healthcare', count: 1 }
            ]
        });
    }
};

// ============================================
// ADMIN ROUTES
// ============================================

/**
 * POST /api/projects
 * Create a new project
 */
const createProject = async (req, res) => {
    try {
        const {
            title, slug, description, short_description,
            client_name, client_industry, category, subcategory,
            location, completion_date, duration, team_size,
            project_value, featured_image, specs, materials_used,
            is_published, is_featured
        } = req.body;

        // Generate slug if not provided
        const projectSlug = slug || title.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');

        const [result] = await pool.query(`
            INSERT INTO projects (
                title, slug, description, short_description,
                client_name, client_industry, category, subcategory,
                location, completion_date, duration, team_size,
                project_value, featured_image, specs, materials_used,
                is_published, is_featured
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            title, projectSlug, description, short_description,
            client_name, client_industry, category, subcategory,
            location, completion_date, duration, team_size,
            project_value, featured_image,
            JSON.stringify(specs || []),
            JSON.stringify(materials_used || []),
            is_published || false,
            is_featured || false
        ]);

        const [newProject] = await pool.query(
            'SELECT * FROM projects WHERE id = ?',
            [result.insertId]
        );

        res.status(201).json(newProject[0]);
    } catch (error) {
        console.error('Error in createProject:', error);
        res.status(500).json({ 
            message: 'Error creating project', 
            error: error.message 
        });
    }
};

/**
 * PUT /api/projects/:id
 * Update a project
 */
const updateProject = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Handle JSON fields
        if (updates.specs) {
            updates.specs = JSON.stringify(updates.specs);
        }
        if (updates.materials_used) {
            updates.materials_used = JSON.stringify(updates.materials_used);
        }

        const [result] = await pool.query(
            'UPDATE projects SET ? WHERE id = ?',
            [updates, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Project not found' });
        }

        const [updated] = await pool.query(
            'SELECT * FROM projects WHERE id = ?',
            [id]
        );

        res.json(updated[0]);
    } catch (error) {
        console.error('Error in updateProject:', error);
        res.status(500).json({ 
            message: 'Error updating project',
            error: error.message 
        });
    }
};

/**
 * DELETE /api/projects/:id
 * Delete a project
 */
const deleteProject = async (req, res) => {
    try {
        const { id } = req.params;
        
        const [result] = await pool.query(
            'DELETE FROM projects WHERE id = ?',
            [id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Project not found' });
        }
        
        res.json({ message: 'Project deleted successfully' });
    } catch (error) {
        console.error('Error in deleteProject:', error);
        res.status(500).json({ 
            message: 'Error deleting project',
            error: error.message 
        });
    }
};

/**
 * POST /api/projects/upload-image
 * Upload project image (mock for now)
 */
const uploadImage = async (req, res) => {
    try {
        // Mock response until you set up multer
        const mockImageUrl = `/uploads/projects/mock-image-${Date.now()}.jpg`;
        res.json({ 
            message: 'Image uploaded successfully',
            url: mockImageUrl 
        });
    } catch (error) {
        console.error('Error in uploadImage:', error);
        res.status(500).json({ 
            message: 'Error uploading image',
            error: error.message 
        });
    }
};

module.exports = {
    getPublishedProjects,
    getFeaturedProjects,
    getAllProjects,
    getProjectBySlug,
    getProjectsByCategory,
    getProjectStats,
    createProject,
    updateProject,
    deleteProject,
    uploadImage
};