-- 1. Create a table to store dynamic task types
CREATE TABLE IF NOT EXISTS task_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Insert the existing static types as defaults
INSERT IGNORE INTO task_types (name) VALUES 
('Site Report / መስክ ሪፖርት'),
('ማራዘሚያ ፈቃድ (ለተጀመረ ግንባታ)'),
('ማራዘሚያ ፈቃድ (ላልተጀመረ ግንባታ)'),
('እድሳት ፈቃድ'),
('Commencement Permit / ማስጀመሪያ ፈቃድ');

-- 3. Modify the tasks table to accept any VARCHAR instead of ENUM
ALTER TABLE tasks MODIFY COLUMN task_type VARCHAR(255) NOT NULL;
