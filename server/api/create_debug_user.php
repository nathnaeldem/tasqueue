<?php
require 'db.php';

$email = 'bot_test@lemikura.gov';
$pass = 'test123';
$name = 'Bot Test User';
$role = 'staff';

// 1. Hash Password
$hash = password_hash($pass, PASSWORD_DEFAULT);

// 2. Insert or Update
// We use ON DUPLICATE KEY UPDATE to reset the password if user exists
// Fix: Use password_hash column
$sql = "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE password_hash = ?, name = ?";

try {
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$name, $email, $hash, $role, $hash, $name]);
    echo "<h1>User Created/Updated</h1>";
    echo "<p>Email: <b>$email</b></p>";
    echo "<p>Password: <b>$pass</b></p>";
    echo "<p>Hash: " . htmlspecialchars($hash) . "</p>";
    echo "<hr>";
    echo "<p>Please try logging into the TELEGRAM BOT with these exact credentials now.</p>";
} catch (PDOException $e) {
    echo "Error: " . $e->getMessage();
}
?>
