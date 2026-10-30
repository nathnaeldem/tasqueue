CREATE TABLE IF NOT EXISTS departments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO departments (id, name, is_active) VALUES (1, 'General Department', TRUE);

ALTER TABLE users
ADD COLUMN department_id INT NULL AFTER role,
ADD COLUMN is_super_admin BOOLEAN NOT NULL DEFAULT FALSE AFTER department_id;

ALTER TABLE task_types
ADD COLUMN department_id INT NULL AFTER name;

ALTER TABLE tasks
ADD COLUMN department_id INT NULL AFTER task_type;

INSERT IGNORE INTO roles (name, is_admin) VALUES
('department_admin', TRUE),
('staff', FALSE);

UPDATE roles SET is_admin = TRUE WHERE name = 'department_admin';
UPDATE roles SET is_admin = FALSE WHERE name = 'staff';

UPDATE users SET role = 'department_admin' WHERE role = 'manager';
UPDATE users SET department_id = 1 WHERE department_id IS NULL;
UPDATE users SET is_super_admin = 1 WHERE id = 1;

UPDATE task_types SET department_id = 1 WHERE department_id IS NULL;
UPDATE tasks SET department_id = 1 WHERE department_id IS NULL;

DELETE FROM roles WHERE name = 'manager';

ALTER TABLE users
MODIFY COLUMN department_id INT NULL,
ADD CONSTRAINT fk_users_department FOREIGN KEY (department_id) REFERENCES departments(id),
ADD INDEX idx_users_department_id (department_id),
ADD INDEX idx_users_is_super_admin (is_super_admin);

ALTER TABLE task_types
MODIFY COLUMN department_id INT NOT NULL,
ADD CONSTRAINT fk_task_types_department FOREIGN KEY (department_id) REFERENCES departments(id),
ADD UNIQUE KEY uq_task_types_department_name (department_id, name),
ADD INDEX idx_task_types_department_id (department_id);

ALTER TABLE tasks
MODIFY COLUMN department_id INT NOT NULL,
ADD CONSTRAINT fk_tasks_department FOREIGN KEY (department_id) REFERENCES departments(id),
ADD INDEX idx_tasks_department_id (department_id);
