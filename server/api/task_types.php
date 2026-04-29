<?php
require 'db.php';

$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents("php://input"), true);

if ($method === 'GET') {
    // Fetch all task types
    try {
        $stmt = $pdo->query("SELECT * FROM task_types ORDER BY name ASC");
        $types = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'task_types' => $types]);
    } catch (PDOException $e) {
        // If table doesn't exist yet, return empty list or fallback
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }

} elseif ($method === 'POST') {
    $action = $_GET['action'] ?? 'create';

    if ($action === 'create') {
        $name = trim($data['name'] ?? '');
        if (!$name) {
            echo json_encode(['success' => false, 'error' => 'Task type name is required']);
            exit;
        }

        try {
            $stmt = $pdo->prepare("INSERT INTO task_types (name) VALUES (?)");
            $stmt->execute([$name]);
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
            $stmt = $pdo->prepare("DELETE FROM task_types WHERE id = ?");
            $stmt->execute([$id]);
            echo json_encode(['success' => true]);
        } catch (PDOException $e) {
            echo json_encode(['success' => false, 'error' => 'Could not delete task type.']);
        }
    }
}
?>
