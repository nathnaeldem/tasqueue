<?php
require 'api/db.php';

try {
    $pdo->exec("ALTER TABLE tasks ADD COLUMN accepted_at TIMESTAMP NULL AFTER assigned_at");
    echo "Migration successful: accepted_at column added.";
} catch (PDOException $e) {
    echo "Migration failed (might already exist): " . $e->getMessage();
}
?>
