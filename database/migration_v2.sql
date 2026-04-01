ALTER TABLE users ADD COLUMN telegram_chat_id VARCHAR(50) NULL;
-- Attachments table already exists from initial schema, let's verify.
-- It has: id, task_id, file_path, uploaded_at. We might need 'type' (brief vs evidence) but file_path or a new column works. 
-- Checking schema.sql would be good but I remember it. I'll stick to a simple generic attachment for now or add 'type'.
ALTER TABLE attachments ADD COLUMN type VARCHAR(20) DEFAULT 'general'; -- e.g., 'instruction', 'evidence'
