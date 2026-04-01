<?php
require 'db.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $result = [];
    
    // 1. Per-Staff Performance Metrics
    $sql = "
        SELECT 
            u.id, 
            u.name,
            COUNT(t.id) as total_assigned,
            SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as total_completed,
            SUM(CASE WHEN t.status = 'ongoing' THEN 1 ELSE 0 END) as total_ongoing,
            SUM(CASE WHEN t.status = 'pending' THEN 1 ELSE 0 END) as total_pending,
            AVG(TIMESTAMPDIFF(SECOND, t.assigned_at, t.accepted_at)) as avg_accept_time,
            AVG(TIMESTAMPDIFF(SECOND, t.accepted_at, t.completed_at)) as avg_complete_time
        FROM users u
        LEFT JOIN tasks t ON u.id = t.assigned_to
        WHERE u.role = 'staff'
        GROUP BY u.id
    ";
    $stmt = $pdo->query($sql);
    $result['staff_stats'] = $stmt->fetchAll();

    // 2. Overall Task Counts by Status
    $sql2 = "SELECT status, COUNT(*) as count FROM tasks GROUP BY status";
    $stmt2 = $pdo->query($sql2);
    $statusCounts = $stmt2->fetchAll();
    $result['status_distribution'] = $statusCounts;

    // 3. Tasks Created Per Day (Last 7 days)
    $sql3 = "
        SELECT DATE(created_at) as date, COUNT(*) as count 
        FROM tasks 
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        GROUP BY DATE(created_at)
        ORDER BY date ASC
    ";
    $stmt3 = $pdo->query($sql3);
    $result['tasks_per_day'] = $stmt3->fetchAll();

    // 4. Tasks Completed Per Day (Last 7 days)
    $sql4 = "
        SELECT DATE(completed_at) as date, COUNT(*) as count 
        FROM tasks 
        WHERE completed_at IS NOT NULL AND completed_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        GROUP BY DATE(completed_at)
        ORDER BY date ASC
    ";
    $stmt4 = $pdo->query($sql4);
    $result['completed_per_day'] = $stmt4->fetchAll();

    // 5. Summary Stats
    $summarySQL = "
        SELECT 
            COUNT(*) as total_tasks,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
            AVG(TIMESTAMPDIFF(SECOND, assigned_at, accepted_at)) as overall_avg_accept,
            AVG(TIMESTAMPDIFF(SECOND, accepted_at, completed_at)) as overall_avg_complete
        FROM tasks
    ";
    $stmtSum = $pdo->query($summarySQL);
    $result['summary'] = $stmtSum->fetch();

    // 6. Staff Count
    $staffCountSQL = "SELECT COUNT(*) as count FROM users WHERE role = 'staff'";
    $stmtStaff = $pdo->query($staffCountSQL);
    $result['staff_count'] = $stmtStaff->fetch()['count'];

    echo json_encode(['success' => true, 'data' => $result]);
}
?>
