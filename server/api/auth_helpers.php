<?php

function get_request_data() {
    static $data = null;

    if ($data === null) {
        $raw = file_get_contents("php://input");
        $parsed = json_decode($raw, true);
        $data = is_array($parsed) ? $parsed : [];
    }

    return $data;
}

function get_request_headers_lower() {
    static $headers = null;

    if ($headers === null) {
        $headers = [];
        if (function_exists('getallheaders')) {
            foreach (getallheaders() as $key => $value) {
                $headers[strtolower($key)] = $value;
            }
        }
    }

    return $headers;
}

function get_current_user_id_from_request() {
    $headers = get_request_headers_lower();
    if (isset($headers['x-user-id']) && $headers['x-user-id'] !== '') {
        return (int)$headers['x-user-id'];
    }

    $data = get_request_data();
    return (int)($_GET['current_user_id'] ?? $_POST['current_user_id'] ?? $data['current_user_id'] ?? 0);
}

function get_requested_department_id() {
    $data = get_request_data();
    $departmentId = $_GET['department_id'] ?? $_POST['department_id'] ?? $data['department_id'] ?? null;

    if ($departmentId === null || $departmentId === '') {
        return null;
    }

    return (int)$departmentId;
}

function json_error($message, $statusCode = 400) {
    http_response_code($statusCode);
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

function get_user_by_id(PDO $pdo, $userId) {
    $stmt = $pdo->prepare(
        "SELECT u.id, u.name, u.email, u.role, u.department_id, u.telegram_chat_id, u.created_at, u.is_super_admin, u.frozen,
                d.name AS department_name,
                COALESCE(r.is_admin, 0) AS role_is_admin
         FROM users u
         LEFT JOIN departments d ON u.department_id = d.id
         LEFT JOIN roles r ON u.role = r.name
         WHERE u.id = ?"
    );
    $stmt->execute([(int)$userId]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        return null;
    }

    $user['is_super_admin'] = (bool)$user['is_super_admin'];
    $user['role_is_admin'] = (bool)$user['role_is_admin'];
    $user['is_admin'] = $user['is_super_admin'] || $user['role_is_admin'];
    $user['department_id'] = $user['department_id'] !== null ? (int)$user['department_id'] : null;

    return $user;
}

function require_current_user(PDO $pdo) {
    $userId = get_current_user_id_from_request();
    if (!$userId) {
        json_error('Current user is required', 401);
    }

    $user = get_user_by_id($pdo, $userId);
    if (!$user) {
        json_error('Current user not found', 401);
    }

    return $user;
}

function ensure_admin(array $actor) {
    if (!$actor['is_admin']) {
        json_error('Admin access required', 403);
    }
}

function ensure_super_admin(array $actor) {
    if (!$actor['is_super_admin']) {
        json_error('Super admin access required', 403);
    }
}

function ensure_department_access(array $actor, $departmentId) {
    if ($actor['is_super_admin']) {
        return;
    }

    if ((int)$actor['department_id'] !== (int)$departmentId) {
        json_error('Department access denied', 403);
    }
}

function resolve_department_scope(array $actor, $requireForSuperAdmin = false) {
    if ($actor['is_super_admin']) {
        $requestedDepartmentId = get_requested_department_id();
        if ($requireForSuperAdmin && !$requestedDepartmentId) {
            json_error('Department is required', 400);
        }
        return $requestedDepartmentId;
    }

    if (empty($actor['department_id'])) {
        json_error('Current user is not assigned to a department', 403);
    }

    return (int)$actor['department_id'];
}

function department_exists(PDO $pdo, $departmentId) {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM departments WHERE id = ?");
    $stmt->execute([(int)$departmentId]);
    return (int)$stmt->fetchColumn() > 0;
}

function get_role(PDO $pdo, $roleName) {
    $stmt = $pdo->prepare("SELECT id, name, is_admin FROM roles WHERE name = ?");
    $stmt->execute([$roleName]);
    $role = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($role) {
        $role['is_admin'] = (bool)$role['is_admin'];
    }

    return $role ?: null;
}
