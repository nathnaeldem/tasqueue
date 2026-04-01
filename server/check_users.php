<?php
require 'api/db.php';

try {
    $stmt = $pdo->query("SELECT count(*) FROM users");
    echo "Users count: " . $stmt->fetchColumn() . "\n";
    
    $stmt = $pdo->query("SELECT email, role FROM users");
    $users = $stmt->fetchAll();
    echo "Existing Users:\n";
    foreach($users as $u) {
        echo "- " . $u['email'] . " (" . $u['role'] . ")\n";
    }

} catch (PDOException $e) {
    echo "DB Error: " . $e->getMessage() . "\n";
    echo "Code: " . $e->getCode();
}
?>
