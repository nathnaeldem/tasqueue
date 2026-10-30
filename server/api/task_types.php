<?php
require 'db.php';
require 'auth_helpers.php';

$method = $_SERVER['REQUEST_METHOD'];
$data = get_request_data();
$actor = require_current_user($pdo);

if ($method === 'GET') {
    try {
        $departmentId = resolve_department_scope($actor, false);
        if ($departmentId) {
            $stmt = $pdo->prepare("SELECT tt.*, d.name AS department_name FROM task_types tt JOIN departments d ON tt.department_id = d.id WHERE tt.department_id = ? ORDER BY tt.name ASC");
            $stmt->execute([$departmentId]);
        } else {
            $stmt = $pdo->query("SELECT tt.*, d.name AS department_name FROM task_types tt JOIN departments d ON tt.department_id = d.id ORDER BY d.name ASC, tt.name ASC");
        }
        $types = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'task_types' => $types]);
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }

} elseif ($method === 'POST') {
    ensure_admin($actor);
    $action = $_GET['action'] ?? 'create';

    if ($action === 'create') {
        $name = trim($data['name'] ?? '');
        $departmentId = resolve_department_scope($actor, true);
        if (!$name) {
            echo json_encode(['success' => false, 'error' => 'Task type name is required']);
            exit;
        }

        if (!department_exists($pdo, $departmentId)) {
            json_error('Department not found');
        }

        try {
            $stmt = $pdo->prepare("INSERT INTO task_types (name, department_id) VALUES (?, ?)");
            $stmt->execute([$name, $departmentId]);
            echo json_encode(['success' => true, 'id' => $pdo->lastInsertId()]);
        } catch (PDOException $e) {
            echo json_encode(['success' => false, 'error' => 'Could not create task type. It might already exist.']);
        }
    
    } elseif ($action === 'delete') {
        $id = $data['id'] ?? 0;
        if (!$id) {
            echo json_encode(['success' => false, 'error' => 'ID is required']);
            exit;
        }

        try {
            $stmt = $pdo->prepare("SELECT department_id FROM task_types WHERE id = ?");
            $stmt->execute([$id]);
            $departmentId = $stmt->fetchColumn();

            if (!$departmentId) {
                json_error('Task type not found', 404);
            }

            ensure_department_access($actor, $departmentId);

            $stmt = $pdo->prepare("DELETE FROM task_types WHERE id = ?");
            $stmt->execute([$id]);
            echo json_encode(['success' => true]);
        } catch (PDOException $e) {
            echo json_encode(['success' => false, 'error' => 'Could not delete task type.']);
        }
    }
}
?>
