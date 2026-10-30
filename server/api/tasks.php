<?php
require 'db.php';
require 'auth_helpers.php';

$method = $_SERVER['REQUEST_METHOD'];
$data = get_request_data();
$actor = require_current_user($pdo);

if ($method === 'GET') {
    if ($actor['is_admin']) {
        $departmentId = resolve_department_scope($actor, false);

        if ($departmentId) {
            $sql = "SELECT t.*, u.name as assignee_name, d.name as department_name
                    FROM tasks t
                    LEFT JOIN users u ON t.assigned_to = u.id
                    LEFT JOIN departments d ON t.department_id = d.id
                    WHERE t.department_id = ?
                    ORDER BY t.created_at DESC";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$departmentId]);
        } else {
            $sql = "SELECT t.*, u.name as assignee_name, d.name as department_name
                    FROM tasks t
                    LEFT JOIN users u ON t.assigned_to = u.id
                    LEFT JOIN departments d ON t.department_id = d.id
                    ORDER BY d.name ASC, t.created_at DESC";
            $stmt = $pdo->query($sql);
        }
    } else {
        $sql = "SELECT t.*, d.name as department_name
                FROM tasks t
                LEFT JOIN departments d ON t.department_id = d.id
                WHERE t.assigned_to = ?
                ORDER BY t.created_at DESC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([(int)$actor['id']]);
    }

    $tasks = $stmt->fetchAll();

    $attachmentsByTaskId = [];
    if (!empty($tasks)) {
        $taskIds = array_map(static fn($task) => (int)$task['id'], $tasks);
        $placeholders = implode(',', array_fill(0, count($taskIds), '?'));
        $attStmt = $pdo->prepare("SELECT * FROM attachments WHERE task_id IN ($placeholders) ORDER BY created_at ASC, id ASC");
        $attStmt->execute($taskIds);
        foreach ($attStmt->fetchAll() as $attachment) {
            $taskId = (int)$attachment['task_id'];
            if (!isset($attachmentsByTaskId[$taskId])) {
                $attachmentsByTaskId[$taskId] = [];
            }
            $attachmentsByTaskId[$taskId][] = $attachment;
        }
    }

    foreach ($tasks as &$task) {
        $task['department_id'] = isset($task['department_id']) ? (int)$task['department_id'] : null;
        $task['assigned_to'] = $task['assigned_to'] !== null ? (int)$task['assigned_to'] : null;
        $task['created_by'] = $task['created_by'] !== null ? (int)$task['created_by'] : null;
        $task['attachments'] = $attachmentsByTaskId[(int)$task['id']] ?? [];
    }

    echo json_encode(['success' => true, 'tasks' => $tasks]);

} elseif ($method === 'POST') {
    $action = $_GET['action'] ?? 'create';

    if ($action === 'create') {
        ensure_admin($actor);

        $taskType = $_POST['task_type'] ?? ($data['task_type'] ?? '');
        $woreda = $_POST['woreda'] ?? ($data['woreda'] ?? null);
        $floor = $_POST['floor'] ?? ($data['floor'] ?? null);
        $coordinateX = $_POST['coordinate_x'] ?? ($data['coordinate_x'] ?? null);
        $coordinateY = $_POST['coordinate_y'] ?? ($data['coordinate_y'] ?? null);
        $desc = $_POST['description'] ?? ($data['description'] ?? '');
        $departmentId = $actor['is_super_admin']
            ? (int)($_POST['department_id'] ?? ($data['department_id'] ?? 0))
            : (int)$actor['department_id'];
        $createdBy = (int)$actor['id'];

        $floor = ($floor === '' || $floor === null) ? null : (int)$floor;
        $coordinateX = ($coordinateX === '' || $coordinateX === null) ? null : (float)$coordinateX;
        $coordinateY = ($coordinateY === '' || $coordinateY === null) ? null : (float)$coordinateY;

        if (!$taskType || !$desc) {
            echo json_encode(['success' => false, 'error' => 'Task type and description required']);
            exit;
        }

        if (!$departmentId || !department_exists($pdo, $departmentId)) {
            json_error('Valid department is required');
        }

        $taskTypeStmt = $pdo->prepare("SELECT id FROM task_types WHERE name = ? AND department_id = ?");
        $taskTypeStmt->execute([$taskType, $departmentId]);
        if (!$taskTypeStmt->fetchColumn()) {
            json_error('Task type is not available for the selected department');
        }

        $stmt = $pdo->prepare("INSERT INTO tasks (task_type, department_id, woreda, `floor`, coordinate_x, coordinate_y, description, created_by, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft')");
        $stmt->execute([$taskType, $departmentId, $woreda, $floor, $coordinateX, $coordinateY, $desc, $createdBy]);
        $taskId = $pdo->lastInsertId();

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
        ensure_admin($actor);

        $taskId = (int)($data['task_id'] ?? 0);
        $targetUserId = $data['target_user_id'] ?? null;
        $taskStmt = $pdo->prepare("SELECT task_type, department_id FROM tasks WHERE id = ?");
        $taskStmt->execute([$taskId]);
        $task = $taskStmt->fetch();

        if (!$taskId || !$task) {
            echo json_encode(['success' => false, 'error' => 'Task not found']);
            exit;
        }

        ensure_department_access($actor, $task['department_id']);

        $selectedStaff = null;

        if ($targetUserId) {
            $staffUser = get_user_by_id($pdo, $targetUserId);
            if (!$staffUser) {
                json_error('Selected user not found', 404);
            }

            if ($staffUser['is_admin'] || $staffUser['is_super_admin']) {
                json_error('Tasks can only be assigned to staff users');
            }

            if ((int)$staffUser['department_id'] !== (int)$task['department_id']) {
                json_error('Selected user does not belong to the task department');
            }

            $selectedStaff = (int)$staffUser['id'];
        } else {
            $staffStmt = $pdo->prepare(
                "SELECT u.id
                 FROM users u
                 LEFT JOIN roles r ON u.role = r.name
                 WHERE u.department_id = ?
                   AND u.is_super_admin = 0
                   AND u.frozen = 0
                   AND (r.is_admin = 0 OR r.is_admin IS NULL)"
            );
            $staffStmt->execute([(int)$task['department_id']]);
            $staffUsers = $staffStmt->fetchAll(PDO::FETCH_COLUMN);

            if (empty($staffUsers)) {
                 echo json_encode(['success' => false, 'error' => 'No staff available']);
                 exit;
            }

            $counts = [];
            foreach($staffUsers as $uid) {
                $stmt = $pdo->prepare("SELECT COUNT(*) FROM tasks WHERE assigned_to = ? AND task_type = ? AND department_id = ?");
                $stmt->execute([$uid, $task['task_type'], $task['department_id']]);
                $counts[$uid] = (int)$stmt->fetchColumn();
            }

            $minCount = min($counts);
            $candidates = array_keys($counts, $minCount);

            if (count($candidates) == 1) {
                $selectedStaff = $candidates[0];
            } else {
                $candidateTimes = [];
                foreach($candidates as $uid) {
                    $stmt = $pdo->prepare("SELECT MAX(assigned_at) FROM tasks WHERE assigned_to = ? AND task_type = ? AND department_id = ?");
                    $stmt->execute([$uid, $task['task_type'], $task['department_id']]);
                    $latest = $stmt->fetchColumn();
                    $candidateTimes[$uid] = $latest ? strtotime($latest) : 0;
                }

                asort($candidateTimes);
                $selectedStaff = array_key_first($candidateTimes);
            }
        }

        $stmt = $pdo->prepare("UPDATE tasks SET assigned_to = ?, status = 'pending', assigned_at = NOW(), accepted_at = NULL, completed_at = NULL WHERE id = ? AND department_id = ?");
        $stmt->execute([$selectedStaff, $taskId, $task['department_id']]);

        $stmtUser = $pdo->prepare("SELECT telegram_chat_id, name FROM users WHERE id = ?");
        $stmtUser->execute([$selectedStaff]);
        $user = $stmtUser->fetch();

        if ($user && !empty($user['telegram_chat_id'])) {
            $msg = "🆕 New Task Assigned!\n\nHello {$user['name']},\nYou have been assigned a new task. Please log in to the portal to accept it.";
            
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
        $taskId = (int)($_POST['task_id'] ?? ($data['task_id'] ?? 0));
        $status = $_POST['status'] ?? ($data['status'] ?? '');
        $userId = (int)$actor['id'];

        $taskStmt = $pdo->prepare("SELECT id, department_id, assigned_to FROM tasks WHERE id = ?");
        $taskStmt->execute([$taskId]);
        $task = $taskStmt->fetch();

        if (!$task) {
            json_error('Task not found', 404);
        }

        ensure_department_access($actor, $task['department_id']);

        if (!$actor['is_admin'] && (int)$task['assigned_to'] !== $userId) {
            json_error('You can only update tasks assigned to you', 403);
        }

        $sql = "UPDATE tasks SET status = ?";
        $params = [$status];

        if ($status === 'ongoing') {
            $sql .= ", accepted_at = NOW()";
        } elseif ($status === 'completed') {
            $sql .= ", completed_at = NOW()";
        }
        
        $sql .= " WHERE id = ? AND department_id = ?";
        $params[] = $taskId;
        $params[] = $task['department_id'];

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        
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
        ensure_admin($actor);

        $taskId = (int)($data['task_id'] ?? 0);
        
        if (!$taskId) {
            echo json_encode(['success' => false, 'error' => 'Task ID required']);
            exit;
        }

        $taskStmt = $pdo->prepare("SELECT department_id FROM tasks WHERE id = ?");
        $taskStmt->execute([$taskId]);
        $taskDepartmentId = $taskStmt->fetchColumn();

        if (!$taskDepartmentId) {
            json_error('Task not found', 404);
        }

        ensure_department_access($actor, $taskDepartmentId);
        
        try {
            $stmt = $pdo->prepare("DELETE FROM attachments WHERE task_id = ?");
            $stmt->execute([$taskId]);
            
            $stmt = $pdo->prepare("DELETE FROM comments WHERE task_id = ?");
            $stmt->execute([$taskId]);
            
            $stmt = $pdo->prepare("DELETE FROM tasks WHERE id = ? AND department_id = ?");
            $stmt->execute([$taskId, $taskDepartmentId]);
            
            echo json_encode(['success' => true]);
        } catch (PDOException $e) {
            echo json_encode(['success' => false, 'error' => 'Failed to delete task']);
        }
    }
}
?>
