<?php
require 'api/db.php';

$sql = file_get_contents('../../database/schema.sql');

try {
    $pdo->exec($sql);
    echo "Database initialized successfully.";
    
    // Check if admin exists, if not create one
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE role = 'manager'");
    $stmt->execute();
    if ($stmt->fetchColumn() == 0) {
        $pass = password_hash('admin123', PASSWORD_DEFAULT);
        $pdo->exec("INSERT INTO users (name, email, password_hash, role) VALUES ('Manager', 'admin@lemikura.gov', '$pass', 'manager')");
        echo "\nDefault manager created (admin@lemikura.gov / admin123)";
    }

} catch (PDOException $e) {
    echo "Error initializing database: " . $e->getMessage();
}
?>
