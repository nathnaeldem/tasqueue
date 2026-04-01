<?php
require 'db.php';

$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents("php://input"), true);

if ($method === 'GET') {
    $role = $_GET['role'] ?? 'staff';
    $userId = $_GET['user_id'] ?? 0;

    if ($role === 'manager') {
        // Manager sees all tasks with assignee info
        $sql = "SELECT t.*, u.name as assignee_name FROM tasks t LEFT JOIN users u ON t.assigned_to = u.id ORDER BY t.created_at DESC";
        $stmt = $pdo->query($sql);
    } else {
        // Staff sees their own tasks
        $sql = "SELECT t.* FROM tasks t WHERE assigned_to = ? ORDER BY created_at DESC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$userId]);
    }
    
    $tasks = $stmt->fetchAll();
    
    // Fetch attachments for each task
    foreach ($tasks as &$task) {
        $attStmt = $pdo->prepare("SELECT * FROM attachments WHERE task_id = ?");
        $attStmt->execute([$task['id']]);
        $task['attachments'] = $attStmt->fetchAll();
    }
    
    echo json_encode(['success' => true, 'tasks' => $tasks]);

} elseif ($method === 'POST') {
    $action = $_GET['action'] ?? 'create';

    if ($action === 'create') {
        // Support both FormData (for file uploads) and JSON
        $taskType = $_POST['task_type'] ?? ($data['task_type'] ?? '');
        $woreda = $_POST['woreda'] ?? ($data['woreda'] ?? null);
        $desc = $_POST['description'] ?? ($data['description'] ?? '');
        $createdBy = $_POST['created_by'] ?? ($data['created_by'] ?? 1);

        if (!$taskType || !$desc) {
            echo json_encode(['success' => false, 'error' => 'Task type and description required']);
            exit;
        }

        $stmt = $pdo->prepare("INSERT INTO tasks (task_type, woreda, description, created_by, status) VALUES (?, ?, ?, ?, 'draft')");
        $stmt->execute([$taskType, $woreda, $desc, $createdBy]);
        $taskId = $pdo->lastInsertId();

        // Handle attachment if present
        if (isset($_FILES['attachment']) && $_FILES['attachment']['error'] == UPLOAD_ERR_OK) {
            $uploadDir = 'uploads/';
            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0777, true);
            }
            $fileName = uniqid() . '_' . basename($_FILES['attachment']['name']);
            $targetPath = $uploadDir . $fileName;

            if (move_uploaded_file($_FILES['attachment']['tmp_name'], $targetPath)) {
                $stmtAtt = $pdo->prepare("INSERT INTO attachments (task_id, file_path, uploaded_by, file_type) VALUES (?, ?, ?, 'brief')");
                $stmtAtt->execute([$taskId, $fileName, $createdBy]);
            }
        }

        echo json_encode(['success' => true, 'task_id' => $taskId]);
    
    } elseif ($action === 'assign') {
        $taskId = $data['task_id'];
        $targetUserId = $data['target_user_id'] ?? null;
        
        $selectedStaff = null;

        if ($targetUserId) {
            // MANUAL ASSIGNMENT (only possible for first task)
            $selectedStaff = $targetUserId;
        } else {
            // FAIRNESS LOGIC
            // 1. Get all staff
            $staffUsers = $pdo->query("SELECT id FROM users WHERE role='staff'")->fetchAll(PDO::FETCH_COLUMN);
            
            if (empty($staffUsers)) {
                 echo json_encode(['success' => false, 'error' => 'No staff available']);
                 exit;
            }

            // 2. Get counts of tasks assigned to each staff
            $counts = [];
            foreach($staffUsers as $uid) {
                $stmt = $pdo->prepare("SELECT COUNT(*) FROM tasks WHERE assigned_to = ?");
                $stmt->execute([$uid]);
                $counts[$uid] = $stmt->fetchColumn();
            }

            // 3. Find candidates with minimum task count
            $minCount = min($counts);
            $candidates = array_keys($counts, $minCount);

            if (count($candidates) == 1) {
                $selectedStaff = $candidates[0];
            } else {
                // 4. Tie-breaker: Who was assigned 'paster' (longest ago)?
                $candidateTimes = [];
                foreach($candidates as $uid) {
                    // Get the time of their LATEST assignment
                    $stmt = $pdo->prepare("SELECT MAX(assigned_at) FROM tasks WHERE assigned_to = ?");
                    $stmt->execute([$uid]);
                    $latest = $stmt->fetchColumn();
                    // If never assigned, time is 0 (will come first in sort)
                    $candidateTimes[$uid] = $latest ? strtotime($latest) : 0;
                }
                // Sort ascending: 0 (never), then old timestamps, then new timestamps.
                asort($candidateTimes);
                $selectedStaff = array_key_first($candidateTimes);
            }
        }

        // Assign
        $now = date('Y-m-d H:i:s');
        $stmt = $pdo->prepare("UPDATE tasks SET assigned_to = ?, status = 'pending', assigned_at = ? WHERE id = ?");
        $stmt->execute([$selectedStaff, $now, $taskId]);

        // TELEGRAM NOTIFICATION
        $stmtUser = $pdo->prepare("SELECT telegram_chat_id, name FROM users WHERE id = ?");
        $stmtUser->execute([$selectedStaff]);
        $user = $stmtUser->fetch();

        if ($user && !empty($user['telegram_chat_id'])) {
            $msg = "🆕 New Task Assigned!\n\nHello {$user['name']},\nYou have been assigned a new task. Please log in to the portal to accept it.";
            
            // Send via Bot API
            $botToken = '8288585533:AAENfZ1Qo2sCtZGq_WjcRLnqRVU1DjAopPg'; 
            $chatId = $user['telegram_chat_id'];
            $url = "https://api.telegram.org/bot{$botToken}/sendMessage";
            $postData = ['chat_id' => $chatId, 'text' => $msg];
            
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_POST, 1);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 2); 
            curl_exec($ch);
            curl_close($ch);
        }

        echo json_encode(['success' => true, 'assigned_to' => $selectedStaff]);

    } elseif ($action === 'update_status') {
        // Support both FormData and JSON
        $taskId = $_POST['task_id'] ?? ($data['task_id'] ?? 0);
        $status = $_POST['status'] ?? ($data['status'] ?? '');
        $userId = $_POST['user_id'] ?? ($data['user_id'] ?? 0);

        $sql = "UPDATE tasks SET status = ?";
        $params = [$status];

        if ($status === 'ongoing') {
            $sql .= ", accepted_at = NOW()";
        } elseif ($status === 'completed') {
            $sql .= ", completed_at = NOW()";
        }
        
        $sql .= " WHERE id = ?";
        $params[] = $taskId;

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        
        // Handle evidence file upload if completing with attachment
        if ($status === 'completed' && isset($_FILES['evidence']) && $_FILES['evidence']['error'] == UPLOAD_ERR_OK) {
            $uploadDir = 'uploads/';
            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0777, true);
            }
            $fileName = uniqid() . '_' . basename($_FILES['evidence']['name']);
            $targetPath = $uploadDir . $fileName;
            
            if (move_uploaded_file($_FILES['evidence']['tmp_name'], $targetPath)) {
                $stmtAtt = $pdo->prepare("INSERT INTO attachments (task_id, file_path, uploaded_by, file_type) VALUES (?, ?, ?, 'evidence')");
                $stmtAtt->execute([$taskId, $fileName, $userId]);
            }
        }
        
        echo json_encode(['success' => true]);
        
    } elseif ($action === 'delete') {
        $taskId = $data['task_id'] ?? 0;
        
        if (!$taskId) {
            echo json_encode(['success' => false, 'error' => 'Task ID required']);
            exit;
        }
        
        try {
            // Delete related records first due to foreign key constraints
            // Delete attachments
            $stmt = $pdo->prepare("DELETE FROM attachments WHERE task_id = ?");
            $stmt->execute([$taskId]);
            
            // Delete comments
            $stmt = $pdo->prepare("DELETE FROM comments WHERE task_id = ?");
            $stmt->execute([$taskId]);
            
            // Delete the task
            $stmt = $pdo->prepare("DELETE FROM tasks WHERE id = ?");
            $stmt->execute([$taskId]);
            
            echo json_encode(['success' => true]);
        } catch (PDOException $e) {
            echo json_encode(['success' => false, 'error' => 'Failed to delete task']);
        }
    }
}
?>
