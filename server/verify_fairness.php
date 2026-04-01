<?php
require 'api/db.php';

function test($name, $condition) {
    echo $name . ": " . ($condition ? "PASS" : "FAIL") . "\n";
}

try {
    // Setup: 3 Staff Members
    $pdo->exec("DELETE FROM tasks");
    $pdo->exec("DELETE FROM users WHERE email LIKE 'teststaff%'");
    
    $ids = [];
    for ($i=1; $i<=3; $i++) {
        $stmt = $pdo->prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, 'hash', 'staff')");
        $stmt->execute(["Staff $i", "teststaff$i@test.com"]);
        $ids[] = $pdo->lastInsertId();
    }
    echo "Created 3 staff members: " . implode(', ', $ids) . "\n";

    // Scenario 1: Assign 3 tasks. Should go to each one.
    $assignments = [];
    for ($i=0; $i<3; $i++) {
        $pdo->exec("INSERT INTO tasks (title, description, created_by, status) VALUES ('Task', 'Desc', 1, 'draft')");
        $taskId = $pdo->lastInsertId();
        
        // Call assignment logic via internal simulation (copying logic from tasks.php for test speed or hitting API? better to use code directly)
        // Let's use curl to hit the local API to be integration test
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, "http://localhost:8000/api/tasks.php?action=assign");
        curl_setopt($ch, CURLOPT_POST, 1);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['task_id' => $taskId]));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        $res = curl_exec($ch);
        $data = json_decode($res, true);
        curl_close($ch);
        
        if ($data['success']) {
            $assignments[] = $data['assigned_to'];
        }
        sleep(1); // Sleep to ensure timestamps differ for "paster" check
    }

    test("Round 1: 3 unique staff assigned", count(array_unique($assignments)) == 3);
    
    // Scenario 2: Assign 4th task. Should go to the one who got the first task (oldest assignment)
    // The previous loop slept 1s between assignments.
    // Staff[0] got task at T+0, Staff[1] at T+1, Staff[2] at T+2.
    // Next task should go to Staff[0] (oldest).
    
    $pdo->exec("INSERT INTO tasks (title, description, created_by, status) VALUES ('Task 4', 'Desc', 1, 'draft')");
    $taskId4 = $pdo->lastInsertId();
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, "http://localhost:8000/api/tasks.php?action=assign");
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['task_id' => $taskId4]));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $res = curl_exec($ch);
    $data = json_decode($res, true);
    curl_close($ch);

    $expected = $assignments[0]; // First person assigned
    test("Round 2: 4th task assigned to longest waiter", $data['assigned_to'] == $expected);
    
    echo "Assigned to: " . $data['assigned_to'] . " (Expected: $expected)\n";

} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
?>
