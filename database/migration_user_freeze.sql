ALTER TABLE users
ADD COLUMN frozen TINYINT(1) NOT NULL DEFAULT 0 AFTER is_super_admin;

CREATE INDEX idx_users_frozen ON users (frozen);
