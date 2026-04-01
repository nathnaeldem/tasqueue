<?php
require 'db.php';

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Max-Age: 3600");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$data = json_decode(file_get_contents("php://input"), true);

if (!isset($data['email']) || !isset($data['password']) || !isset($data['telegram_chat_id'])) {
    echo json_encode(['success' => false, 'error' => 'Missing fields']);
    exit;
}

$email = $data['email'];
$password = $data['password'];
$chatId = $data['telegram_chat_id'];

// AUTHENTICATE
$stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
$stmt->execute([$email]);
$user = $stmt->fetch();

if ($user && password_verify($password, $user['password'])) {
    // LINK TELEGRAM ID
    $upd = $pdo->prepare("UPDATE users SET telegram_chat_id = ? WHERE id = ?");
    $upd->execute([$chatId, $user['id']]);
    
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => false, 'error' => 'Invalid Valid Credentials']);
}
?>
