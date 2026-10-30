<?php
require 'db.php';
require 'auth_helpers.php';

header("Content-Type: application/json");

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$data = get_request_data();
$actor = require_current_user($pdo);

if ($method === 'GET') {
    ensure_admin($actor);

    if ($actor['is_super_admin']) {
        $requestedDepartmentId = get_requested_department_id();
        if ($requestedDepartmentId) {
            $stmt = $pdo->prepare(
                "SELECT u.id, u.name, u.email, u.role, u.telegram_chat_id, u.created_at, u.department_id, u.is_super_admin, u.frozen, d.name AS department_name
                 FROM users u
                 LEFT JOIN departments d ON u.department_id = d.id
                 WHERE u.department_id = ?
                 ORDER BY u.created_at DESC"
            );
            $stmt->execute([$requestedDepartmentId]);
        } else {
            $stmt = $pdo->query(
                "SELECT u.id, u.name, u.email, u.role, u.telegram_chat_id, u.created_at, u.department_id, u.is_super_admin, u.frozen, d.name AS department_name
                 FROM users u
                 LEFT JOIN departments d ON u.department_id = d.id
                 ORDER BY d.name ASC, u.created_at DESC"
            );
        }
    } else {
        $stmt = $pdo->prepare(
            "SELECT u.id, u.name, u.email, u.role, u.telegram_chat_id, u.created_at, u.department_id, u.is_super_admin, u.frozen, d.name AS department_name
             FROM users u
             LEFT JOIN departments d ON u.department_id = d.id
             WHERE u.department_id = ?
             ORDER BY u.created_at DESC"
        );
        $stmt->execute([(int)$actor['department_id']]);
    }

    $users = $stmt->fetchAll();
    foreach ($users as &$user) {
        $user['department_id'] = $user['department_id'] !== null ? (int)$user['department_id'] : null;
        $user['is_super_admin'] = (bool)$user['is_super_admin'];
        $user['frozen'] = (bool)$user['frozen'];
    }
    echo json_encode(['success' => true, 'users' => $users]);

} elseif ($method === 'POST') {
    if ($action === 'delete') {
        ensure_admin($actor);
        $userId = $data['user_id'] ?? 0;

        $targetUser = get_user_by_id($pdo, $userId);
        if (!$targetUser) {
            json_error('User not found', 404);
        }

        if ($targetUser['is_super_admin']) {
            json_error('Cannot delete super admin accounts', 403);
        }

        ensure_department_access($actor, $targetUser['department_id']);

        if (!$actor['is_super_admin'] && $targetUser['is_admin']) {
            json_error('Department admins cannot delete admin accounts', 403);
        }
        
        try {
            $pdo->beginTransaction();

            $stmt = $pdo->prepare("UPDATE tasks SET assigned_to = NULL WHERE assigned_to = ?");
            $stmt->execute([$userId]);
            $unassignedCount = $stmt->rowCount();

            $stmt = $pdo->prepare("DELETE FROM comments WHERE user_id = ?");
            $stmt->execute([$userId]);
            $commentsDeleted = $stmt->rowCount();

            $stmt = $pdo->prepare("DELETE FROM attachments WHERE uploaded_by = ?");
            $stmt->execute([$userId]);
            $attachmentsDeleted = $stmt->rowCount();

            $stmt = $pdo->prepare("UPDATE tasks SET created_by = NULL WHERE created_by = ?");
            $stmt->execute([$userId]);

            $stmt = $pdo->prepare("DELETE FROM users WHERE id = ?");
            $stmt->execute([$userId]);

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
        ensure_admin($actor);
        $targetUserId = (int)($data['user_id'] ?? 0);
        $name = trim($data['name'] ?? '');
        $email = trim($data['email'] ?? '');
        $role = trim($data['role'] ?? '');
        $password = $data['password'] ?? null;
        $isSuperAdminUpdate = isset($data['is_super_admin']) ? (int)$data['is_super_admin'] : null;

        $departmentId = $actor['is_super_admin']
            ? (isset($data['department_id']) && $data['department_id'] !== '' ? (int)$data['department_id'] : null)
            : (int)$actor['department_id'];

        if (!$targetUserId || !$name || !$email || !$role) {
            json_error('Missing required fields');
        }

        $targetUser = get_user_by_id($pdo, $targetUserId);
        if (!$targetUser) {
            json_error('User not found', 404);
        }

        if (!$departmentId && $isSuperAdminUpdate !== 1) {
            if (!$targetUser['is_super_admin']) {
                json_error('Department is required for non-super admins');
            }
        }

        if ($targetUser['is_super_admin']) {
            json_error('Cannot modify super admin accounts here', 403);
        }

        ensure_department_access($actor, $targetUser['department_id']);

        $roleInfo = get_role($pdo, $role);
        if (!$roleInfo) {
            json_error('Role not found');
        }

        if (!$actor['is_super_admin']) {
            if ($roleInfo['is_admin'] || $targetUser['is_admin']) {
                json_error('Department admins cannot manage admin accounts', 403);
            }
            $departmentId = (int)$actor['department_id'];
        } else {
            if (!$departmentId || !department_exists($pdo, $departmentId)) {
                json_error('Valid department is required');
            }
        }
        
        if (!$name || !$email) {
            echo json_encode(['success' => false, 'error' => 'Name and email required']);
            exit;
        }
        
        try {
            $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ? AND id != ?");
            $stmt->execute([$email, $targetUserId]);
            if ($stmt->fetch()) {
                echo json_encode(['success' => false, 'error' => 'Email already in use']);
                exit;
            }
            
            if ($password) {
                $hash = password_hash($password, PASSWORD_DEFAULT);
                $stmt = $pdo->prepare("UPDATE users SET name = ?, email = ?, role = ?, department_id = ?, password_hash = ? WHERE id = ?");
                $stmt->execute([$name, $email, $role, $departmentId, $hash, $targetUserId]);
            } else {
                $stmt = $pdo->prepare("UPDATE users SET name = ?, email = ?, role = ?, department_id = ? WHERE id = ?");
                $stmt->execute([$name, $email, $role, $departmentId, $targetUserId]);
            }
            
            echo json_encode(['success' => true]);
        } catch (PDOException $e) {
            echo json_encode(['success' => false, 'error' => 'Failed to update user']);
        }
    } elseif ($action === 'freeze' || $action === 'unfreeze') {
        ensure_admin($actor);
        $userId = (int)($data['user_id'] ?? 0);

        $targetUser = get_user_by_id($pdo, $userId);
        if (!$targetUser) {
            json_error('User not found', 404);
        }

        if ($targetUser['is_super_admin']) {
            json_error('Cannot freeze super admin accounts', 403);
        }

        ensure_department_access($actor, $targetUser['department_id']);

        $frozen = $action === 'freeze' ? 1 : 0;
        $stmt = $pdo->prepare("UPDATE users SET frozen = ? WHERE id = ?");
        $stmt->execute([$frozen, $userId]);

        echo json_encode(['success' => true, 'frozen' => (bool)$frozen]);
    }
}
?>
