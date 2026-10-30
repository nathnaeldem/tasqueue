<?php
require 'db.php';
require 'auth_helpers.php';

$data = get_request_data();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_GET['action'] ?? '';

    if ($action === 'register') {
        $actor = require_current_user($pdo);
        ensure_admin($actor);

        $name = trim($data['name'] ?? '');
        $email = trim($data['email'] ?? '');
        $password = $data['password'] ?? '';
        $role = trim($data['role'] ?? 'staff');
        $departmentId = $actor['is_super_admin']
            ? (isset($data['department_id']) && $data['department_id'] !== '' ? (int)$data['department_id'] : null)
            : (int)$actor['department_id'];

        if (!$name || !$email || !$password) {
            json_error('Name, email, and password are required');
        }

        if (!$departmentId && $role !== 'super_admin' && !isset($data['is_super_admin'])) {
            json_error('Department is required for non-super admins');
        }

        if (!$actor['is_super_admin']) {
            $roleInfo = get_role($pdo, $role);
            if ($roleInfo && $roleInfo['is_admin']) {
                json_error('Department admins cannot create admin accounts', 403);
            }
        }

        $isSuperAdmin = $actor['is_super_admin'] && !empty($data['is_super_admin']) ? 1 : 0;

        $hash = password_hash($password, PASSWORD_DEFAULT);

        try {
            $stmt = $pdo->prepare("INSERT INTO users (name, email, password_hash, role, department_id, is_super_admin) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->execute([$name, $email, $hash, $role, $departmentId, $isSuperAdmin]);
            echo json_encode(['success' => true, 'message' => 'User registered successfully']);
        } catch (PDOException $e) {
            echo json_encode(['success' => false, 'error' => 'Registration failed: ' . $e->getMessage()]);
        }
    } elseif ($action === 'login') {
        $email = trim($data['email'] ?? '');
        $password = $data['password'] ?? '';

        $stmt = $pdo->prepare(
            "SELECT u.*, d.name AS department_name, COALESCE(r.is_admin, 0) AS role_is_admin
             FROM users u
             LEFT JOIN departments d ON u.department_id = d.id
             LEFT JOIN roles r ON u.role = r.name
             WHERE u.email = ?"
        );
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if ($user && password_verify($password, $user['password_hash'])) {
            unset($user['password_hash']);
            $user['is_super_admin'] = (bool)$user['is_super_admin'];
            $user['role_is_admin'] = (bool)$user['role_is_admin'];
            $user['is_admin'] = $user['is_super_admin'] || $user['role_is_admin'];
            $user['department_id'] = $user['department_id'] !== null ? (int)$user['department_id'] : null;
            echo json_encode(['success' => true, 'user' => $user]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Invalid credentials']);
        }
    }
}
?>
