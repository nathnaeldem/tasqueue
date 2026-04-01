<?php
require 'db.php';

header("Content-Type: application/json");

$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents("php://input"), true);
$action = $_GET['action'] ?? '';

if ($method === 'GET') {
    $taskId = $_GET['task_id'] ?? 0;
    
    // Get comments for a task
    $sql = "SELECT c.*, u.name as user_name, u.role as user_role 
            FROM comments c 
            JOIN users u ON c.user_id = u.id 
            WHERE c.task_id = ? 
            ORDER BY c.created_at ASC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$taskId]);
    $comments = $stmt->fetchAll();
    
    echo json_encode(['success' => true, 'comments' => $comments]);

} elseif ($method === 'POST') {
    // Add a new comment (supports FormData for file upload)
    $taskId = $_POST['task_id'] ?? ($data['task_id'] ?? 0);
    $userId = $_POST['user_id'] ?? ($data['user_id'] ?? 0);
    $message = $_POST['message'] ?? ($data['message'] ?? '');
    
    $attachmentPath = null;
    
    // Handle file upload if present
    if (isset($_FILES['attachment']) && $_FILES['attachment']['error'] == UPLOAD_ERR_OK) {
        $uploadDir = 'uploads/comments/';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0777, true);
        }
        $fileName = uniqid() . '_' . basename($_FILES['attachment']['name']);
        $targetPath = $uploadDir . $fileName;
        
        if (move_uploaded_file($_FILES['attachment']['tmp_name'], $targetPath)) {
            $attachmentPath = $fileName;
        }
    }
    
    $stmt = $pdo->prepare("INSERT INTO comments (task_id, user_id, message, attachment_path) VALUES (?, ?, ?, ?)");
    $stmt->execute([$taskId, $userId, $message, $attachmentPath]);
    
    $commentId = $pdo->lastInsertId();
    
    // Return the new comment with user info
    $stmt = $pdo->prepare("SELECT c.*, u.name as user_name, u.role as user_role FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?");
    $stmt->execute([$commentId]);
    $newComment = $stmt->fetch();
    
    // TELEGRAM NOTIFICATION for new comment
    // Get task info and assigned staff's telegram
    $taskStmt = $pdo->prepare("SELECT t.*, u.telegram_chat_id, u.name as staff_name, u.id as staff_id FROM tasks t JOIN users u ON t.assigned_to = u.id WHERE t.id = ?");
    $taskStmt->execute([$taskId]);
    $taskInfo = $taskStmt->fetch();
    
    // Notify the assigned staff if the commenter is NOT the staff (i.e., admin commented)
    if ($taskInfo && $taskInfo['staff_id'] != $userId && !empty($taskInfo['telegram_chat_id'])) {
        $commenterName = $newComment['user_name'];
        $msgPreview = strlen($message) > 50 ? substr($message, 0, 50) . '...' : $message;
        $telegramMsg = "💬 New Comment on Task!\n\n📋 Task: {$taskInfo['title']}\n👤 From: {$commenterName}\n\n\"{$msgPreview}\"\n\nLog in to view and reply.";
        
        $botToken = '8288585533:AAENfZ1Qo2sCtZGq_WjcRLnqRVU1DjAopPg';
        $url = "https://api.telegram.org/bot{$botToken}/sendMessage";
        $postData = ['chat_id' => $taskInfo['telegram_chat_id'], 'text' => $telegramMsg];
        
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_POST, 1);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 2);
        curl_exec($ch);
        curl_close($ch);
    }
    
    echo json_encode(['success' => true, 'comment' => $newComment]);
}
?>
