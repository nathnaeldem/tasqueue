<?php
require 'db.php';

header("Content-Type: application/json");

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$data = json_decode(file_get_contents("php://input"), true);

if ($method === 'GET') {
    // List all users
    $stmt = $pdo->query("SELECT id, name, email, role, telegram_chat_id, created_at FROM users ORDER BY created_at DESC");
    $users = $stmt->fetchAll();
    echo json_encode(['success' => true, 'users' => $users]);

} elseif ($method === 'POST') {
    if ($action === 'delete') {
        $userId = $data['user_id'] ?? 0;
        
        // Prevent deleting user ID 1 (main admin)
        if ($userId == 1) {
            echo json_encode(['success' => false, 'error' => 'Cannot delete main admin']);
            exit;
        }
        
        try {
            // Start transaction for data integrity
            $pdo->beginTransaction();
            
            // 1. Unassign all tasks assigned to this user (set to NULL)
            $stmt = $pdo->prepare("UPDATE tasks SET assigned_to = NULL WHERE assigned_to = ?");
            $stmt->execute([$userId]);
            $unassignedCount = $stmt->rowCount();
            
            // 2. Delete user's comments
            $stmt = $pdo->prepare("DELETE FROM comments WHERE user_id = ?");
            $stmt->execute([$userId]);
            $commentsDeleted = $stmt->rowCount();
            
            // 3. Delete user's uploaded attachments from DB (files remain on disk)
            $stmt = $pdo->prepare("DELETE FROM attachments WHERE uploaded_by = ?");
            $stmt->execute([$userId]);
            $attachmentsDeleted = $stmt->rowCount();
            
            // 4. Keep tasks created_by for audit trail (just set to NULL to avoid FK error)
            $stmt = $pdo->prepare("UPDATE tasks SET created_by = NULL WHERE created_by = ?");
            $stmt->execute([$userId]);
            
            // 5. Delete the user
            $stmt = $pdo->prepare("DELETE FROM users WHERE id = ?");
            $stmt->execute([$userId]);
            
            // Commit transaction
            $pdo->commit();
            
            $message = "User deleted successfully.";
            if ($unassignedCount > 0) $message .= " Unassigned $unassignedCount task(s).";
            if ($commentsDeleted > 0) $message .= " Deleted $commentsDeleted comment(s).";
            if ($attachmentsDeleted > 0) $message .= " Deleted $attachmentsDeleted attachment(s).";
            
            echo json_encode(['success' => true, 'message' => $message]);
        } catch (PDOException $e) {
            $pdo->rollBack();
            echo json_encode(['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
        }
        
    } elseif ($action === 'update') {
        $userId = $data['user_id'] ?? 0;
        $name = $data['name'] ?? '';
        $email = $data['email'] ?? '';
        $role = $data['role'] ?? 'staff';
        $password = $data['password'] ?? null;
        
        if (!$name || !$email) {
            echo json_encode(['success' => false, 'error' => 'Name and email required']);
            exit;
        }
        
        try {
            // Check if email is already taken by another user
            $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ? AND id != ?");
            $stmt->execute([$email, $userId]);
            if ($stmt->fetch()) {
                echo json_encode(['success' => false, 'error' => 'Email already in use']);
                exit;
            }
            
            // Update user
            if ($password) {
                // Update with new password
                $hash = password_hash($password, PASSWORD_DEFAULT);
                $stmt = $pdo->prepare("UPDATE users SET name = ?, email = ?, role = ?, password_hash = ? WHERE id = ?");
                $stmt->execute([$name, $email, $role, $hash, $userId]);
            } else {
                // Update without changing password
                $stmt = $pdo->prepare("UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?");
                $stmt->execute([$name, $email, $role, $userId]);
            }
            
            echo json_encode(['success' => true]);
        } catch (PDOException $e) {
            echo json_encode(['success' => false, 'error' => 'Failed to update user']);
        }
    }
}
?>
