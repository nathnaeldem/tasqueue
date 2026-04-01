<?php
// Enable full error reporting
ini_set('display_errors', 1);
error_reporting(E_ALL);

require 'db.php';

echo "<h1>Detailed Task Creation Debug</h1>";

// Simulate what the frontend sends
echo "<h2>1. Testing with FormData-like structure</h2>";

// Simulate POST data
$_POST['title'] = 'Frontend Test Task';
$_POST['description'] = 'Testing from simulated frontend';
$_POST['created_by'] = 1;

echo "<p>Simulated POST data:</p>";
echo "<pre>";
print_r($_POST);
echo "</pre>";

// Now run the actual task creation logic
try {
    $title = $_POST['title'] ?? '';
    $desc = $_POST['description'] ?? '';
    $createdBy = $_POST['created_by'] ?? 1;

    echo "<p>Extracted values:</p>";
    echo "<p>Title: $title</p>";
    echo "<p>Description: $desc</p>";
    echo "<p>Created By: $createdBy</p>";

    $stmt = $pdo->prepare("INSERT INTO tasks (title, description, created_by, status) VALUES (?, ?, ?, 'draft')");
    $stmt->execute([$title, $desc, $createdBy]);
    $taskId = $pdo->lastInsertId();
    
    echo "<p>✅ Task created with ID: $taskId</p>";
    
    // Verify it's in the database
    $verify = $pdo->query("SELECT * FROM tasks WHERE id = $taskId")->fetch();
    echo "<p>Verification:</p>";
    echo "<pre>" . print_r($verify, true) . "</pre>";
    
    // Clean up
    $pdo->exec("DELETE FROM tasks WHERE id = $taskId");
    echo "<p>(Test task deleted)</p>";
    
} catch (Exception $e) {
    echo "<p>❌ ERROR: " . $e->getMessage() . "</p>";
    echo "<pre>" . $e->getTraceAsString() . "</pre>";
}

echo "<hr>";
echo "<h2>2. Check current tasks.php file</h2>";
$tasksPhpPath = __DIR__ . '/tasks.php';
if (file_exists($tasksPhpPath)) {
    echo "<p>✅ tasks.php exists</p>";
    echo "<p>File size: " . filesize($tasksPhpPath) . " bytes</p>";
    echo "<p>Last modified: " . date('Y-m-d H:i:s', filemtime($tasksPhpPath)) . "</p>";
} else {
    echo "<p>❌ tasks.php NOT FOUND at: $tasksPhpPath</p>";
}

echo "<hr>";
echo "<h2>3. Test actual endpoint</h2>";
echo "<p>Try making a request to: <a href='tasks.php?action=create' target='_blank'>tasks.php?action=create</a></p>";
echo "<p>(This will fail without POST data, but check if you get a 500 or different error)</p>";
?>
