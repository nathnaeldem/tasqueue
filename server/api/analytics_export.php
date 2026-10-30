<?php
require 'db.php';
require 'auth_helpers.php';
require 'analytics_helpers.php';

function xlsx_escape(string $value): string {
    return htmlspecialchars($value, ENT_XML1 | ENT_QUOTES, 'UTF-8');
}

function xlsx_column_name(int $index): string {
    $name = '';
    $index += 1;
    while ($index > 0) {
        $mod = ($index - 1) % 26;
        $name = chr(65 + $mod) . $name;
        $index = intdiv($index - 1, 26);
    }
    return $name;
}

function xlsx_sheet_name(string $value): string {
    $clean = preg_replace('/[\\\/?*\[\]:]/', '', $value) ?: 'Sheet';
    return mb_substr($clean, 0, 31);
}

function xlsx_cell_xml(string $cellRef, $value): string {
    if ($value === null || $value === '') {
        return '<c r="' . $cellRef . '" t="inlineStr"><is><t></t></is></c>';
    }
    return '<c r="' . $cellRef . '" t="inlineStr"><is><t xml:space="preserve">' . xlsx_escape((string)$value) . '</t></is></c>';
}

function xlsx_build_sheet(array $rows): string {
    $xmlRows = [];
    foreach ($rows as $rowIndex => $row) {
        $cells = [];
        foreach ($row as $colIndex => $value) {
            $cellRef = xlsx_column_name($colIndex) . ($rowIndex + 1);
            $cells[] = xlsx_cell_xml($cellRef, $value);
        }
        $xmlRows[] = '<row r="' . ($rowIndex + 1) . '">' . implode('', $cells) . '</row>';
    }

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        . '<sheetData>' . implode('', $xmlRows) . '</sheetData>'
        . '</worksheet>';
}

function xlsx_build_overview_rows(array $report, array $actor): array {
    $summary = $report['summary'] ?? [];
    $rows = [
        ['Metric', 'Value'],
        ['Generated For', $actor['name'] ?? ''],
        ['Role', !empty($actor['is_admin']) ? 'Admin' : 'Staff'],
        ['Department', $actor['department_name'] ?? 'All Departments'],
        ['Date Range', $report['range']['label'] ?? ''],
        ['Total Tasks', $summary['total_tasks'] ?? 0],
        ['Completed Tasks', $summary['completed_tasks'] ?? 0],
        ['Average Accept Time', $summary['overall_avg_accept'] ?? 'N/A'],
        ['Average Complete Time', $summary['overall_avg_complete'] ?? 'N/A'],
    ];

    if (isset($summary['ongoing_tasks'])) {
        $rows[] = ['Ongoing Tasks', $summary['ongoing_tasks'] ?? 0];
    }
    if (isset($summary['pending_tasks'])) {
        $rows[] = ['Pending Tasks', $summary['pending_tasks'] ?? 0];
    }
    if (isset($summary['completion_rate'])) {
        $rows[] = ['Completion Rate %', $summary['completion_rate'] ?? 0];
    }
    if (isset($report['staff_count'])) {
        $rows[] = ['Staff Count', $report['staff_count'] ?? 0];
    }

    $rows[] = [];
    $rows[] = ['Status', 'Count'];
    foreach ($report['status_distribution'] ?? [] as $statusRow) {
        $rows[] = [$statusRow['status'] ?? '', $statusRow['count'] ?? 0];
    }

    return $rows;
}

function xlsx_build_admin_summary_rows(array $report): array {
    $rows = [[
        'Name', 'Email', 'Department', 'Role', 'Assigned', 'Completed', 'Ongoing', 'Pending', 'Avg Accept Seconds', 'Avg Complete Seconds', 'Last Completed'
    ]];

    foreach ($report['staff_stats'] ?? [] as $stat) {
        $rows[] = [
            $stat['name'] ?? '',
            $stat['email'] ?? '',
            $stat['department_name'] ?? '',
            $stat['role'] ?? '',
            $stat['total_assigned'] ?? 0,
            $stat['total_completed'] ?? 0,
            $stat['total_ongoing'] ?? 0,
            $stat['total_pending'] ?? 0,
            $stat['avg_accept_time'] ?? '',
            $stat['avg_complete_time'] ?? '',
            $stat['last_completed_at'] ?? '',
        ];
    }

    return $rows;
}

function xlsx_build_completed_rows(array $report, bool $isAdmin): array {
    $header = $isAdmin
        ? ['User', 'Email', 'Department', 'Task Type', 'Description', 'Woreda', 'Floor', 'Coordinate X', 'Coordinate Y', 'Created', 'Assigned', 'Accepted', 'Completed', 'Accept Seconds', 'Complete Seconds']
        : ['Task Type', 'Description', 'Woreda', 'Floor', 'Coordinate X', 'Coordinate Y', 'Created', 'Assigned', 'Accepted', 'Completed', 'Accept Seconds', 'Complete Seconds'];
    $rows = [$header];

    foreach ($report['completed_task_details'] ?? [] as $task) {
        $base = [
            $task['task_type'] ?? '',
            $task['description'] ?? '',
            $task['woreda'] ?? '',
            $task['floor'] ?? '',
            $task['coordinate_x'] ?? '',
            $task['coordinate_y'] ?? '',
            $task['created_at'] ?? '',
            $task['assigned_at'] ?? '',
            $task['accepted_at'] ?? '',
            $task['completed_at'] ?? '',
            $task['accept_time_seconds'] ?? '',
            $task['complete_time_seconds'] ?? '',
        ];
        if ($isAdmin) {
            array_unshift($base,
                $task['department_name'] ?? ''
            );
            array_unshift($base,
                $task['email'] ?? ''
            );
            array_unshift($base,
                $task['user_name'] ?? ''
            );
        }
        $rows[] = $base;
    }

    return $rows;
}

function xlsx_build_active_rows(array $report): array {
    $rows = [[
        'Status', 'Task Type', 'Description', 'Woreda', 'Floor', 'Coordinate X', 'Coordinate Y', 'Created', 'Assigned', 'Accepted'
    ]];

    foreach ($report['active_tasks'] ?? [] as $task) {
        $rows[] = [
            $task['status'] ?? '',
            $task['task_type'] ?? '',
            $task['description'] ?? '',
            $task['woreda'] ?? '',
            $task['floor'] ?? '',
            $task['coordinate_x'] ?? '',
            $task['coordinate_y'] ?? '',
            $task['created_at'] ?? '',
            $task['assigned_at'] ?? '',
            $task['accepted_at'] ?? '',
        ];
    }

    return $rows;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_error('Method not allowed', 405);
}

if (!class_exists('ZipArchive')) {
    json_error('ZipArchive is not available on this server', 500);
}

$actor = require_current_user($pdo);
$report = analytics_fetch_report($pdo, $actor, true);
if (!$actor['is_admin']) {
    $report['active_tasks'] = analytics_fetch_staff_active_tasks($pdo, (int)$actor['id']);
}

$sheets = [
    ['name' => 'Overview', 'rows' => xlsx_build_overview_rows($report, $actor)],
];

if (!empty($actor['is_admin'])) {
    $sheets[] = ['name' => 'Staff Summary', 'rows' => xlsx_build_admin_summary_rows($report)];
}

$sheets[] = ['name' => 'Completed Tasks', 'rows' => xlsx_build_completed_rows($report, !empty($actor['is_admin']))];

if (empty($actor['is_admin'])) {
    $sheets[] = ['name' => 'Active Tasks', 'rows' => xlsx_build_active_rows($report)];
}

$tempFile = tempnam(sys_get_temp_dir(), 'analytics_xlsx_');
$zip = new ZipArchive();
$zip->open($tempFile, ZipArchive::OVERWRITE);

$contentTypes = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
];
$workbookSheets = [];
$workbookRels = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
];

foreach ($sheets as $index => $sheet) {
    $sheetNumber = $index + 1;
    $sheetPath = 'xl/worksheets/sheet' . $sheetNumber . '.xml';
    $zip->addFromString($sheetPath, xlsx_build_sheet($sheet['rows']));
    $contentTypes[] = '<Override PartName="/xl/worksheets/sheet' . $sheetNumber . '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    $workbookSheets[] = '<sheet name="' . xlsx_escape(xlsx_sheet_name($sheet['name'])) . '" sheetId="' . $sheetNumber . '" r:id="rId' . ($sheetNumber + 1) . '"/>';
    $workbookRels[] = '<Relationship Id="rId' . ($sheetNumber + 1) . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' . $sheetNumber . '.xml"/>';
}

$contentTypes[] = '</Types>';
$zip->addFromString('[Content_Types].xml', implode('', $contentTypes));
$zip->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
$zip->addFromString('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' . implode('', $workbookSheets) . '</sheets></workbook>');
$workbookRels[] = '</Relationships>';
$zip->addFromString('xl/_rels/workbook.xml.rels', implode('', $workbookRels));
$zip->addFromString('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>');
$zip->close();

$fileLabel = !empty($actor['is_admin']) ? 'analytics-report' : 'my-analytics-report';
$range = $report['range'] ?? ['start_date' => date('Y-m-d'), 'end_date' => date('Y-m-d')];
$fileName = $fileLabel . '-' . $range['start_date'] . '-to-' . $range['end_date'] . '.xlsx';

if (ob_get_length()) {
    ob_end_clean();
}
header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
header('Content-Disposition: attachment; filename="' . $fileName . '"');
header('Content-Length: ' . filesize($tempFile));
readfile($tempFile);
unlink($tempFile);
exit;
?>
