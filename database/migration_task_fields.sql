-- Add task_type and woreda columns to tasks table
-- IMPORTANT: ENUM values must match EXACTLY what frontend sends (including Amharic)
ALTER TABLE tasks 
ADD COLUMN task_type ENUM(
    'Site Report / መስክ ሪፖርት', 
    'ማራዘሚያ ፈቃድ (ለተጀመረ ግንባታ)',
    'ማራዘሚያ ፈቃድ (ላልተጀመረ ግንባታ)',
    'እድሳት ፈቃድ',
    'Commencement Permit / ማስጀመሪያ ፈቃድ'
) NOT NULL DEFAULT 'Site Report / መስክ ሪፖርት' AFTER title,
ADD COLUMN woreda VARCHAR(10) NULL AFTER task_type;

-- Update existing tasks to have a default task_type if needed
-- This is optional and can be skipped if starting fresh
