CREATE TABLE IF NOT EXISTS bot_sessions (
    chat_id VARCHAR(50) PRIMARY KEY,
    state VARCHAR(50) NOT NULL, -- 'WAITING_EMAIL', 'WAITING_PASSWORD'
    temp_data TEXT NULL, -- JSON to store email while waiting for password
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
