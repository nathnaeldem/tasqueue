-- 1. Create a table to store dynamic user roles
CREATE TABLE IF NOT EXISTS roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Insert the existing static roles as defaults
-- We mark 'manager' as the default admin role
INSERT IGNORE INTO roles (name, is_admin) VALUES 
('manager', TRUE),
('staff', FALSE);

-- 3. Modify the users table to accept any VARCHAR instead of ENUM for the role
ALTER TABLE users MODIFY COLUMN role VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'staff';
