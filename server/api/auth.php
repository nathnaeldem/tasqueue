<?php
require 'db.php';

$data = json_decode(file_get_contents("php://input"), true);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_GET['action'] ?? '';

    if ($action === 'register') {
        $name = $data['name'];
        $email = $data['email'];
        $password = $data['password'];
        // Default register as staff
        $role = 'staff'; 

        $hash = password_hash($password, PASSWORD_DEFAULT);

        try {
            $stmt = $pdo->prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)");
            $stmt->execute([$name, $email, $hash, $role]);
            echo json_encode(['success' => true, 'message' => 'User registered successfully']);
        } catch (PDOException $e) {
            echo json_encode(['success' => false, 'error' => 'Registration failed: ' . $e->getMessage()]);
        }
    } elseif ($action === 'login') {
        $email = $data['email'];
        $password = $data['password'];

        $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        // Fix: Use password_hash column
        if ($user && password_verify($password, $user['password_hash'])) {
            // ... session/token logic ...
             // Return user info (excluding hash)
             unset($user['password_hash']);
             echo json_encode(['success' => true, 'user' => $user]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Invalid credentials']);
        }
    }
}
?>
