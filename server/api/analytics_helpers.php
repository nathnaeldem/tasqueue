<?php
require_once 'auth_helpers.php';

function analytics_parse_date_range(): array {
    $today = new DateTimeImmutable('today');
    $defaultEnd = $today;
    $defaultStart = $today->sub(new DateInterval('P29D'));

    $startInput = trim($_GET['date_start'] ?? '');
    $endInput = trim($_GET['date_end'] ?? '');

    $start = $defaultStart;
    $end = $defaultEnd;

    if ($startInput !== '') {
        $parsed = DateTimeImmutable::createFromFormat('Y-m-d', $startInput);
        if (!$parsed || $parsed->format('Y-m-d') !== $startInput) {
            json_error('Invalid start date. Use YYYY-MM-DD.', 400);
        }
        $start = $parsed;
    }

    if ($endInput !== '') {
        $parsed = DateTimeImmutable::createFromFormat('Y-m-d', $endInput);
        if (!$parsed || $parsed->format('Y-m-d') !== $endInput) {
            json_error('Invalid end date. Use YYYY-MM-DD.', 400);
        }
        $end = $parsed;
    }

    if ($start > $end) {
        json_error('Start date cannot be after end date.', 400);
    }

    if ($start->diff($end)->days > 365) {
        json_error('Date range cannot exceed 365 days.', 400);
    }

    return [
        'start_date' => $start->format('Y-m-d'),
        'end_date' => $end->format('Y-m-d'),
        'start_datetime' => $start->format('Y-m-d 00:00:00'),
        'end_datetime' => $end->format('Y-m-d 23:59:59'),
        'label' => $start->format('M j, Y') . ' - ' . $end->format('M j, Y'),
    ];
}

function analytics_duration_sql(string $alias, string $fromColumn, string $toColumn): string {
    return "CASE WHEN {$alias}.{$fromColumn} IS NOT NULL AND {$alias}.{$toColumn} IS NOT NULL AND {$alias}.{$toColumn} >= {$alias}.{$fromColumn} THEN TIMESTAMPDIFF(SECOND, {$alias}.{$fromColumn}, {$alias}.{$toColumn}) END";
}

function analytics_fetch_report(PDO $pdo, array $actor, bool $includeDetails = false): array {
    $range = analytics_parse_date_range();
    return $actor['is_admin']
        ? analytics_fetch_admin_report($pdo, $actor, $range, $includeDetails)
        : analytics_fetch_staff_report($pdo, $actor, $range, $includeDetails);
}

function analytics_fetch_admin_report(PDO $pdo, array $actor, array $range, bool $includeDetails): array {
    $departmentId = resolve_department_scope($actor, false);
    $result = ['range' => $range];
    $acceptSql = analytics_duration_sql('t', 'assigned_at', 'accepted_at');
    $completeSql = analytics_duration_sql('t', 'accepted_at', 'completed_at');

    $staffSql = "
        SELECT
            u.id,
            u.name,
            u.email,
            u.role,
            d.name AS department_name,
            COUNT(t.id) AS total_assigned,
            SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS total_completed,
            SUM(CASE WHEN t.status = 'ongoing' THEN 1 ELSE 0 END) AS total_ongoing,
            SUM(CASE WHEN t.status = 'pending' THEN 1 ELSE 0 END) AS total_pending,
            AVG($acceptSql) AS avg_accept_time,
            AVG($completeSql) AS avg_complete_time,
            MAX(t.completed_at) AS last_completed_at
        FROM users u
        LEFT JOIN roles r ON u.role = r.name
        LEFT JOIN departments d ON u.department_id = d.id
        LEFT JOIN tasks t ON u.id = t.assigned_to
            AND t.department_id = u.department_id
            AND t.created_at BETWEEN ? AND ?
        WHERE u.is_super_admin = 0
          AND (r.is_admin = 0 OR r.is_admin IS NULL)";
    $staffParams = [$range['start_datetime'], $range['end_datetime']];
    if ($departmentId) {
        $staffSql .= " AND u.department_id = ?";
        $staffParams[] = $departmentId;
    }
    $staffSql .= " GROUP BY u.id, u.name, u.email, u.role, d.name ORDER BY total_completed DESC, u.name ASC";
    $stmt = $pdo->prepare($staffSql);
    $stmt->execute($staffParams);
    $result['staff_stats'] = $stmt->fetchAll();

    $summaryWhere = "WHERE t.created_at BETWEEN ? AND ?";
    $summaryParams = [$range['start_datetime'], $range['end_datetime']];
    if ($departmentId) {
        $summaryWhere .= " AND t.department_id = ?";
        $summaryParams[] = $departmentId;
    }

    $statusSql = "SELECT t.status, COUNT(*) AS count FROM tasks t $summaryWhere GROUP BY t.status";
    $stmtStatus = $pdo->prepare($statusSql);
    $stmtStatus->execute($summaryParams);
    $result['status_distribution'] = $stmtStatus->fetchAll();

    $createdTrendSql = "
        SELECT DATE(t.created_at) AS date, COUNT(*) AS count
        FROM tasks t
        $summaryWhere
        GROUP BY DATE(t.created_at)
        ORDER BY date ASC
    ";
    $stmtCreatedTrend = $pdo->prepare($createdTrendSql);
    $stmtCreatedTrend->execute($summaryParams);
    $result['tasks_per_day'] = $stmtCreatedTrend->fetchAll();

    $completedWhere = "WHERE t.completed_at IS NOT NULL AND t.completed_at BETWEEN ? AND ?";
    $completedParams = [$range['start_datetime'], $range['end_datetime']];
    if ($departmentId) {
        $completedWhere .= " AND t.department_id = ?";
        $completedParams[] = $departmentId;
    }

    $completedTrendSql = "
        SELECT DATE(t.completed_at) AS date, COUNT(*) AS count
        FROM tasks t
        $completedWhere
        GROUP BY DATE(t.completed_at)
        ORDER BY date ASC
    ";
    $stmtCompletedTrend = $pdo->prepare($completedTrendSql);
    $stmtCompletedTrend->execute($completedParams);
    $result['completed_per_day'] = $stmtCompletedTrend->fetchAll();

    $summarySql = "
        SELECT
            COUNT(*) AS total_tasks,
            SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS completed_tasks,
            AVG(CASE WHEN t.assigned_at IS NOT NULL AND t.accepted_at IS NOT NULL AND t.accepted_at >= t.assigned_at THEN TIMESTAMPDIFF(SECOND, t.assigned_at, t.accepted_at) END) AS overall_avg_accept,
            AVG(CASE WHEN t.accepted_at IS NOT NULL AND t.completed_at IS NOT NULL AND t.completed_at >= t.accepted_at THEN TIMESTAMPDIFF(SECOND, t.accepted_at, t.completed_at) END) AS overall_avg_complete
        FROM tasks t
        $summaryWhere
    ";
    $stmtSummary = $pdo->prepare($summarySql);
    $stmtSummary->execute($summaryParams);
    $result['summary'] = $stmtSummary->fetch();

    $allTimeWhere = '';
    $allTimeParams = [];
    if ($departmentId) {
        $allTimeWhere = ' WHERE t.department_id = ?';
        $allTimeParams[] = $departmentId;
    }
    $allTimeSql = "
        SELECT
            COUNT(*) AS total_tasks,
            SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS completed_tasks,
            SUM(CASE WHEN t.status = 'ongoing' THEN 1 ELSE 0 END) AS ongoing_tasks,
            SUM(CASE WHEN t.status = 'pending' THEN 1 ELSE 0 END) AS pending_tasks,
            AVG(CASE WHEN t.assigned_at IS NOT NULL AND t.accepted_at IS NOT NULL AND t.accepted_at >= t.assigned_at THEN TIMESTAMPDIFF(SECOND, t.assigned_at, t.accepted_at) END) AS overall_avg_accept,
            AVG(CASE WHEN t.accepted_at IS NOT NULL AND t.completed_at IS NOT NULL AND t.completed_at >= t.accepted_at THEN TIMESTAMPDIFF(SECOND, t.accepted_at, t.completed_at) END) AS overall_avg_complete
        FROM tasks t
        $allTimeWhere
    ";
    $stmtAllTime = $pdo->prepare($allTimeSql);
    $stmtAllTime->execute($allTimeParams);
    $result['all_time_summary'] = $stmtAllTime->fetch();

    $staffCountSql = "
        SELECT COUNT(*) AS count
        FROM users u
        LEFT JOIN roles r ON u.role = r.name
        WHERE u.is_super_admin = 0
          AND (r.is_admin = 0 OR r.is_admin IS NULL)";
    $staffCountParams = [];
    if ($departmentId) {
        $staffCountSql .= " AND u.department_id = ?";
        $staffCountParams[] = $departmentId;
    }
    $stmtStaffCount = $pdo->prepare($staffCountSql);
    $stmtStaffCount->execute($staffCountParams);
    $result['staff_count'] = (int)($stmtStaffCount->fetch()['count'] ?? 0);

    if ($includeDetails) {
        $detailSql = "
            SELECT
                u.id AS user_id,
                u.name AS user_name,
                u.email,
                u.role,
                d.name AS department_name,
                t.id AS task_id,
                t.task_type,
                t.description,
                t.woreda,
                t.floor,
                t.coordinate_x,
                t.coordinate_y,
                t.created_at,
                t.assigned_at,
                t.accepted_at,
                t.completed_at,
                $acceptSql AS accept_time_seconds,
                $completeSql AS complete_time_seconds
            FROM users u
            LEFT JOIN roles r ON u.role = r.name
            LEFT JOIN departments d ON u.department_id = d.id
            INNER JOIN tasks t ON u.id = t.assigned_to AND t.department_id = u.department_id
            WHERE u.is_super_admin = 0
              AND (r.is_admin = 0 OR r.is_admin IS NULL)
              AND t.status = 'completed'
              AND t.completed_at IS NOT NULL
              AND t.completed_at BETWEEN ? AND ?";
        $detailParams = [$range['start_datetime'], $range['end_datetime']];
        if ($departmentId) {
            $detailSql .= " AND u.department_id = ?";
            $detailParams[] = $departmentId;
        }
        $detailSql .= " ORDER BY u.name ASC, t.completed_at DESC";
        $stmtDetail = $pdo->prepare($detailSql);
        $stmtDetail->execute($detailParams);
        $result['completed_task_details'] = $stmtDetail->fetchAll();
    }

    return $result;
}

function analytics_fetch_staff_report(PDO $pdo, array $actor, array $range, bool $includeDetails): array {
    $result = ['range' => $range];
    $acceptSql = analytics_duration_sql('t', 'assigned_at', 'accepted_at');
    $completeSql = analytics_duration_sql('t', 'accepted_at', 'completed_at');
    $taskParams = [(int)$actor['id'], $range['start_datetime'], $range['end_datetime']];
    $taskWhere = "WHERE t.assigned_to = ? AND t.created_at BETWEEN ? AND ?";

    $summarySql = "
        SELECT
            COUNT(*) AS total_tasks,
            SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS completed_tasks,
            SUM(CASE WHEN t.status = 'ongoing' THEN 1 ELSE 0 END) AS ongoing_tasks,
            SUM(CASE WHEN t.status = 'pending' THEN 1 ELSE 0 END) AS pending_tasks,
            AVG($acceptSql) AS overall_avg_accept,
            AVG($completeSql) AS overall_avg_complete,
            MAX(t.completed_at) AS last_completed_at
        FROM tasks t
        $taskWhere
    ";
    $stmtSummary = $pdo->prepare($summarySql);
    $stmtSummary->execute($taskParams);
    $summary = $stmtSummary->fetch() ?: [];
    $summary['completion_rate'] = (!empty($summary['total_tasks']) && (int)$summary['total_tasks'] > 0)
        ? round(((int)($summary['completed_tasks'] ?? 0) / (int)$summary['total_tasks']) * 100)
        : 0;
    $result['summary'] = $summary;

    $allTimeSql = "
        SELECT
            COUNT(*) AS total_tasks,
            SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS completed_tasks,
            SUM(CASE WHEN t.status = 'ongoing' THEN 1 ELSE 0 END) AS ongoing_tasks,
            SUM(CASE WHEN t.status = 'pending' THEN 1 ELSE 0 END) AS pending_tasks,
            AVG($acceptSql) AS overall_avg_accept,
            AVG($completeSql) AS overall_avg_complete,
            MAX(t.completed_at) AS last_completed_at
        FROM tasks t
        WHERE t.assigned_to = ?
    ";
    $stmtAllTime = $pdo->prepare($allTimeSql);
    $stmtAllTime->execute([(int)$actor['id']]);
    $allTime = $stmtAllTime->fetch() ?: [];
    $allTime['completion_rate'] = (!empty($allTime['total_tasks']) && (int)$allTime['total_tasks'] > 0)
        ? round(((int)($allTime['completed_tasks'] ?? 0) / (int)$allTime['total_tasks']) * 100)
        : 0;
    $result['all_time_summary'] = $allTime;

    $statusSql = "SELECT t.status, COUNT(*) AS count FROM tasks t $taskWhere GROUP BY t.status";
    $stmtStatus = $pdo->prepare($statusSql);
    $stmtStatus->execute($taskParams);
    $result['status_distribution'] = $stmtStatus->fetchAll();

    $createdTrendSql = "
        SELECT DATE(t.created_at) AS date, COUNT(*) AS count
        FROM tasks t
        $taskWhere
        GROUP BY DATE(t.created_at)
        ORDER BY date ASC
    ";
    $stmtCreatedTrend = $pdo->prepare($createdTrendSql);
    $stmtCreatedTrend->execute($taskParams);
    $result['tasks_per_day'] = $stmtCreatedTrend->fetchAll();

    $completedTrendSql = "
        SELECT DATE(t.completed_at) AS date, COUNT(*) AS count
        FROM tasks t
        WHERE t.assigned_to = ?
          AND t.completed_at IS NOT NULL
          AND t.completed_at BETWEEN ? AND ?
        GROUP BY DATE(t.completed_at)
        ORDER BY date ASC
    ";
    $stmtCompletedTrend = $pdo->prepare($completedTrendSql);
    $stmtCompletedTrend->execute($taskParams);
    $result['completed_per_day'] = $stmtCompletedTrend->fetchAll();

    if ($includeDetails) {
        $detailSql = "
            SELECT
                t.id AS task_id,
                t.task_type,
                t.description,
                t.woreda,
                t.floor,
                t.coordinate_x,
                t.coordinate_y,
                t.created_at,
                t.assigned_at,
                t.accepted_at,
                t.completed_at,
                $acceptSql AS accept_time_seconds,
                $completeSql AS complete_time_seconds
            FROM tasks t
            WHERE t.assigned_to = ?
              AND t.status = 'completed'
              AND t.completed_at IS NOT NULL
              AND t.completed_at BETWEEN ? AND ?
            ORDER BY t.completed_at DESC
        ";
        $stmtDetail = $pdo->prepare($detailSql);
        $stmtDetail->execute($taskParams);
        $result['completed_task_details'] = $stmtDetail->fetchAll();
    }

    return $result;
}

function analytics_fetch_staff_active_tasks(PDO $pdo, int $userId): array {
    $stmt = $pdo->prepare(
        "SELECT id, task_type, description, woreda, floor, coordinate_x, coordinate_y, status, created_at, assigned_at, accepted_at
         FROM tasks
         WHERE assigned_to = ?
           AND status IN ('pending', 'ongoing')
         ORDER BY CASE status WHEN 'ongoing' THEN 0 ELSE 1 END, created_at DESC"
    );
    $stmt->execute([$userId]);
    return $stmt->fetchAll();
}
?>
