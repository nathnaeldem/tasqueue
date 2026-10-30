ALTER TABLE tasks
ADD INDEX idx_tasks_assigned_created_at (assigned_to, created_at),
ADD INDEX idx_tasks_assigned_completed_at (assigned_to, completed_at),
ADD INDEX idx_tasks_assigned_status_created_at (assigned_to, status, created_at),
ADD INDEX idx_tasks_department_created_at (department_id, created_at),
ADD INDEX idx_tasks_department_completed_at (department_id, completed_at),
ADD INDEX idx_tasks_department_assigned_created_at (department_id, assigned_to, created_at);

ALTER TABLE attachments
ADD INDEX idx_attachments_task_created_at (task_id, created_at);
