<?php
require 'db.php';
require 'auth_helpers.php';

$method = $_SERVER['REQUEST_METHOD'];
$data = get_request_data();
$actor = require_current_user($pdo);

if ($method === 'GET') {
    ensure_admin($actor);
    try {
        $stmt = $pdo->query("SELECT * FROM roles ORDER BY name ASC");
        $roles = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($roles as &$role) {
            $role['is_admin'] = (bool)$role['is_admin'];
        }
        echo json_encode(['success' => true, 'roles' => $roles]);
    } catch (PDOException $e) {
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }

} elseif ($method === 'POST') {
    ensure_super_admin($actor);
    $action = $_GET['action'] ?? 'create';

    if ($action === 'create') {
        $name = trim($data['name'] ?? '');
        $isAdmin = isset($data['is_admin']) ? (bool)$data['is_admin'] : false;

        if (!$name) {
            echo json_encode(['success' => false, 'error' => 'Role name is required']);
            exit;
        }

        try {
            $stmt = $pdo->prepare("INSERT INTO roles (name, is_admin) VALUES (?, ?)");
            $stmt->execute([$name, $isAdmin ? 1 : 0]);
            echo json_encode(['success' => true, 'id' => $pdo->lastInsertId()]);
        } catch (PDOException $e) {
            echo json_encode(['success' => false, 'error' => 'Could not create role. It might already exist.']);
        }
    
    } elseif ($action === 'delete') {
        $id = $data['id'] ?? 0;
        
        if (!$id) {
            echo json_encode(['success' => false, 'error' => 'ID is required']);
            exit;
        }

        try {
            $stmtCheck = $pdo->prepare("SELECT name, is_admin FROM roles WHERE id = ?");
            $stmtCheck->execute([$id]);
            $roleToDelete = $stmtCheck->fetch();

            if ($roleToDelete && in_array($roleToDelete['name'], ['department_admin', 'staff'], true)) {
                echo json_encode(['success' => false, 'error' => 'Cannot delete a core system role.']);
                exit;
            }

            $stmt = $pdo->prepare("DELETE FROM roles WHERE id = ?");
            $stmt->execute([$id]);
            echo json_encode(['success' => true]);
        } catch (PDOException $e) {
            echo json_encode(['success' => false, 'error' => 'Could not delete role. It might be assigned to users.']);
        }
    }
}
?>
