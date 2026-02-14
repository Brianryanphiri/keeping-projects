USE kayvan_db;

-- ============================================
-- MIGRATION: Add all missing columns to projects table
-- ============================================

-- First, check if columns exist and add them if they don't

-- Add short_description column
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS short_description VARCHAR(300) AFTER description;

-- Add client_industry column
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS client_industry VARCHAR(255) AFTER client_name;

-- Add subcategory column
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS subcategory VARCHAR(100) AFTER category;

-- Add project details columns
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS duration VARCHAR(100) AFTER completion_date,
ADD COLUMN IF NOT EXISTS duration_days INT AFTER duration,
ADD COLUMN IF NOT EXISTS surface_area VARCHAR(100) AFTER duration_days,
ADD COLUMN IF NOT EXISTS project_value DECIMAL(15,2) AFTER surface_area;

-- Add JSON fields for arrays
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS specs JSON AFTER project_value,
ADD COLUMN IF NOT EXISTS materials_used JSON AFTER specs,
ADD COLUMN IF NOT EXISTS results JSON AFTER materials_used,
ADD COLUMN IF NOT EXISTS testimonials JSON AFTER results,
ADD COLUMN IF NOT EXISTS awards JSON AFTER testimonials,
ADD COLUMN IF NOT EXISTS sustainability_features JSON AFTER awards,
ADD COLUMN IF NOT EXISTS tags JSON AFTER sustainability_features;

-- Add team members column
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS team_members JSON AFTER team_size;

-- Add is_featured column
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE AFTER is_published;

-- Add updated_at column
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

-- Add SEO columns
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS seo_title VARCHAR(255) AFTER updated_at,
ADD COLUMN IF NOT EXISTS seo_description VARCHAR(300) AFTER seo_title,
ADD COLUMN IF NOT EXISTS seo_keywords VARCHAR(500) AFTER seo_description;

-- Add address fields
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS address VARCHAR(500) AFTER location,
ADD COLUMN IF NOT EXISTS city VARCHAR(100) AFTER address,
ADD COLUMN IF NOT EXISTS country VARCHAR(100) AFTER city;

-- Add video_url column
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS video_url VARCHAR(500) AFTER featured_image;

-- Add client website column
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS client_website VARCHAR(500) AFTER client_industry;

-- Add team_size column if not exists
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS team_size VARCHAR(100) AFTER duration_days;

-- ============================================
-- Create project_gallery_images table
-- ============================================
CREATE TABLE IF NOT EXISTS project_gallery_images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL,
    image_url VARCHAR(500) NOT NULL,
    caption VARCHAR(255),
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    INDEX idx_project_id (project_id),
    INDEX idx_sort_order (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Add indexes for better performance
-- ============================================
ALTER TABLE projects 
ADD INDEX IF NOT EXISTS idx_category (category),
ADD INDEX IF NOT EXISTS idx_is_published (is_published),
ADD INDEX IF NOT EXISTS idx_is_featured (is_featured),
ADD INDEX IF NOT EXISTS idx_slug (slug),
ADD INDEX IF NOT EXISTS idx_completion_date (completion_date);

-- Add fulltext search index
ALTER TABLE projects 
ADD FULLTEXT INDEX IF NOT EXISTS ft_project_search (title, description, short_description, client_name, location, tags);

-- ============================================
-- Update existing records with default values
-- ============================================

-- Set default values for NULL columns
UPDATE projects SET short_description = SUBSTRING(description, 1, 300) WHERE short_description IS NULL AND description IS NOT NULL;
UPDATE projects SET short_description = 'Project description' WHERE short_description IS NULL;
UPDATE projects SET is_featured = FALSE WHERE is_featured IS NULL;
UPDATE projects SET specs = '[]' WHERE specs IS NULL;
UPDATE projects SET materials_used = '[]' WHERE materials_used IS NULL;
UPDATE projects SET results = '[]' WHERE results IS NULL;
UPDATE projects SET tags = '[]' WHERE tags IS NULL;

-- ============================================
-- Verify the migration
-- ============================================
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'kayvan_db' 
AND TABLE_NAME = 'projects'
ORDER BY ORDINAL_POSITION;