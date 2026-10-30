<?php
require 'db.php';
require 'auth_helpers.php';
require 'analytics_helpers.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $actor = require_current_user($pdo);
    $includeDetails = isset($_GET['include_details']) && $_GET['include_details'] === '1';
    $result = analytics_fetch_report($pdo, $actor, $includeDetails);
    if (!$actor['is_admin']) {
        $result['active_tasks'] = analytics_fetch_staff_active_tasks($pdo, (int)$actor['id']);
    }
    $result['viewer'] = [
        'id' => (int)$actor['id'],
        'is_admin' => (bool)$actor['is_admin'],
        'is_super_admin' => (bool)$actor['is_super_admin'],
        'department_id' => $actor['department_id'],
        'department_name' => $actor['department_name'] ?? null,
    ];
    echo json_encode(['success' => true, 'data' => $result]);
}
?>
