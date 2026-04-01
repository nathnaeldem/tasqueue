<?php
require 'api/db.php';

try {
    $pdo->exec("ALTER TABLE users ADD COLUMN telegram_chat_id VARCHAR(50) NULL");
    echo "Added telegram_chat_id to users.\n";
} catch (Exception $e) { echo "telegram_chat_id might exist.\n"; }

try {
    // Schema already has file_type ENUM('brief', 'evidence') based on cat check
    // But let's ensure it handles what we need.
    echo "Attachments table verification skipped (looks correct).\n";
} catch (Exception $e) { echo "Error checking attachments.\n"; }

?>
