<?php
require 'db.php';
require 'auth_helpers.php';

header("Content-Type: application/json; charset=utf-8");

$method = $_SERVER['REQUEST_METHOD'];
$data = get_request_data();
$actor = require_current_user($pdo);

if ($method === 'GET') {
    try {
        if ($actor['is_super_admin']) {
            $sql = "SELECT d.id, d.name, d.is_active, d.created_at,
                           COUNT(DISTINCT CASE WHEN u.is_super_admin = 0 AND COALESCE(r.is_admin, 0) = 1 THEN u.id END) AS admin_count,
                           COUNT(DISTINCT CASE WHEN u.is_super_admin = 0 AND COALESCE(r.is_admin, 0) = 0 THEN u.id END) AS staff_count,
                           COUNT(DISTINCT tt.id) AS task_type_count,
                           COUNT(DISTINCT t.id) AS task_count
                    FROM departments d
                    LEFT JOIN users u ON u.department_id = d.id
                    LEFT JOIN roles r ON u.role = r.name
                    LEFT JOIN task_types tt ON tt.department_id = d.id
                    LEFT JOIN tasks t ON t.department_id = d.id
                    GROUP BY d.id
                    ORDER BY d.name ASC";
            $stmt = $pdo->query($sql);
            $departments = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } else {
            $stmt = $pdo->prepare("SELECT id, name, is_active, created_at FROM departments WHERE id = ?");
            $stmt->execute([(int)$actor['department_id']]);
            $departments = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }

        foreach ($departments as &$department) {
            if (isset($department['is_active'])) {
                $department['is_active'] = (bool)$department['is_active'];
            }
        }

        echo json_encode(['success' => true, 'departments' => $departments]);
    } catch (PDOException $e) {
        json_error('Failed to load departments');
    }
} elseif ($method === 'POST') {
    ensure_super_admin($actor);

    $action = $_GET['action'] ?? 'create';

    if ($action === 'create') {
        $name = trim($data['name'] ?? '');
        if (!$name) {
            json_error('Department name is required');
        }

        try {
            $stmt = $pdo->prepare("INSERT INTO departments (name, is_active) VALUES (?, 1)");
            $stmt->execute([$name]);
            echo json_encode(['success' => true, 'id' => $pdo->lastInsertId()]);
        } catch (PDOException $e) {
            json_error('Could not create department. It might already exist.');
        }
    } elseif ($action === 'update') {
        $departmentId = (int)($data['id'] ?? 0);
        $name = trim($data['name'] ?? '');
        $isActive = isset($data['is_active']) ? (int)((bool)$data['is_active']) : 1;

        if (!$departmentId || !$name) {
            json_error('Department id and name are required');
        }

        try {
            $stmt = $pdo->prepare("UPDATE departments SET name = ?, is_active = ? WHERE id = ?");
            $stmt->execute([$name, $isActive, $departmentId]);
            echo json_encode(['success' => true]);
        } catch (PDOException $e) {
            json_error('Could not update department');
        }
    } elseif ($action === 'delete') {
        $departmentId = (int)($data['id'] ?? 0);

        if (!$departmentId) {
            json_error('Department id is required');
        }

        if ($departmentId === 1) {
            json_error('The default department cannot be deleted');
        }

        try {
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE department_id = ?");
            $stmt->execute([$departmentId]);
            $userCount = (int)$stmt->fetchColumn();

            $stmt = $pdo->prepare("SELECT COUNT(*) FROM task_types WHERE department_id = ?");
            $stmt->execute([$departmentId]);
            $taskTypeCount = (int)$stmt->fetchColumn();

            $stmt = $pdo->prepare("SELECT COUNT(*) FROM tasks WHERE department_id = ?");
            $stmt->execute([$departmentId]);
            $taskCount = (int)$stmt->fetchColumn();

            if ($userCount > 0 || $taskTypeCount > 0 || $taskCount > 0) {
                json_error('Cannot delete a department that still has users, task types, or tasks');
            }

            $stmt = $pdo->prepare("DELETE FROM departments WHERE id = ?");
            $stmt->execute([$departmentId]);
            echo json_encode(['success' => true]);
        } catch (PDOException $e) {
            json_error('Could not delete department');
        }
    }
}
