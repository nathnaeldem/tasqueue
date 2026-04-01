<?php
require 'db.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!isset($_FILES['file'])) {
        echo json_encode(['success' => false, 'error' => 'No file uploaded']);
        exit;
    }

    $taskId = $_POST['task_id'];
    $uploadedBy = $_POST['user_id'];
    $type = $_POST['type']; // 'brief' or 'evidence'

    $file = $_FILES['file'];
    $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
    $filename = uniqid() . '.' . $ext;
    $targetDir = "../uploads/";
    
    // Ensure dir exists
    if (!is_dir($targetDir)) {
        mkdir($targetDir, 0777, true);
    }

    $targetFile = $targetDir . $filename;

    if (move_uploaded_file($file['tmp_name'], $targetFile)) {
        // Save to DB
        $stmt = $pdo->prepare("INSERT INTO attachments (task_id, file_path, uploaded_by, file_type) VALUES (?, ?, ?, ?)");
        $stmt->execute([$taskId, 'uploads/' . $filename, $uploadedBy, $type]);
        
        echo json_encode(['success' => true, 'file_path' => 'uploads/' . $filename]);
    } else {
         echo json_encode(['success' => false, 'error' => 'Failed to move uploaded file']);
    }
}
?>
