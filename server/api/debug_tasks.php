<?php
// Enable Error Display
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

require 'db.php';

echo "<h1>Debug Task Creation</h1>";

// 1. Check if attachments table has 'type' column
try {
    $checkCol = $pdo->query("DESCRIBE attachments");
    $columns = $checkCol->fetchAll(PDO::FETCH_COLUMN);
    echo "<h2>Attachments Table Columns:</h2>";
    echo "<pre>" . print_r($columns, true) . "</pre>";
} catch (Exception $e) {
    echo "<p>Error checking table: " . $e->getMessage() . "</p>";
}

// 2. Simulate Task Creation
echo "<h2>Test Task Creation:</h2>";
try {
    $title = "Debug Test Task";
    $desc = "Testing";
    $createdBy = 1; // Assume admin ID 1

    $stmt = $pdo->prepare("INSERT INTO tasks (title, description, created_by, status) VALUES (?, ?, ?, 'draft')");
    $stmt->execute([$title, $desc, $createdBy]);
    $taskId = $pdo->lastInsertId();
    
    echo "<p>✅ Task created successfully with ID: $taskId</p>";
    
    // Clean up test
    $pdo->exec("DELETE FROM tasks WHERE id = $taskId");
    echo "<p>(Test task deleted)</p>";
    
} catch (PDOException $e) {
    echo "<p>❌ Error: " . $e->getMessage() . "</p>";
}

echo "<hr><p>If you see errors above, they explain the 500 issue.</p>";
?>
