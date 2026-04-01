<?php
require 'db.php';

// Bot Token
$botToken = '8288585533:AAENfZ1Qo2sCtZGq_WjcRLnqRVU1DjAopPg'; 
$apiUrl = "https://api.telegram.org/bot{$botToken}/";

// Receive Update
$content = file_get_contents("php://input");
$update = json_decode($content, true);

if (!$update || !isset($update['message'])) {
    exit;
}

$chatId = $update['message']['chat']['id'];
$text = trim($update['message']['text'] ?? '');

// 1. Check current session state
$stmt = $pdo->prepare("SELECT * FROM bot_sessions WHERE chat_id = ?");
$stmt->execute([$chatId]);
$session = $stmt->fetch();

$state = $session['state'] ?? 'NONE';

// --- COMMAND HANDLERS ---

if ($text === '/start' || $text === '/login') {
    // Start Login Flow
    updateSession($chatId, 'WAITING_EMAIL', null);
    sendMessage($chatId, "👋 Welcome to Lemikura Staff Bot!\n\nLet's link your account.\n\nPlease enter your **Staff Email**:");
    return;
}

// --- STATE MACHINE HANDLERS ---

if ($state === 'WAITING_EMAIL') {
    $emailInput = strtolower(trim($text));
    
    // Validate Email Format simple check
    if (!filter_var($emailInput, FILTER_VALIDATE_EMAIL)) {
        sendMessage($chatId, "❌ That doesn't look like a valid email. Please try again or /start to restart.");
        return;
    }
    
    // Debug: Confirm what we received
    // sendMessage($chatId, "Debug: Received email '$emailInput'");

    updateSession($chatId, 'WAITING_PASSWORD', json_encode(['email' => $emailInput]));
    sendMessage($chatId, "✅ Got it. Now please enter your **Password**:");
    return;
}

if ($state === 'WAITING_PASSWORD') {
    $tempData = json_decode($session['temp_data'], true);
    $email = $tempData['email'];
    $password = trim($text); // Important: Trim password too
    
    // Verify Credentials
    // We strictly compare email lowercased just in case
    $stmtUser = $pdo->prepare("SELECT * FROM users WHERE LOWER(email) = ?");
    $stmtUser->execute([$email]);
    $user = $stmtUser->fetch();
    
    // Debug Logic (Optional - remove in prod if strict security needed, but helpful now)
    if (!$user) {
         sendMessage($chatId, "❌ User not found with email: $email");
         deleteSession($chatId);
         return;
    }

    // FIX: Use 'password_hash' column
    if (password_verify($password, $user['password_hash'])) {
        // SUCCESS: Link account
        $upd = $pdo->prepare("UPDATE users SET telegram_chat_id = ? WHERE id = ?");
        $upd->execute([$chatId, $user['id']]);
        
        // Clear session
        deleteSession($chatId);
        
        sendMessage($chatId, "🎉 **Login Successful!**\n\nHello {$user['name']}, your Telegram account is now linked.\nYou will receive notifications here for new tasks.");
    } else {
        // FAIL
        sendMessage($chatId, "❌ **Login Failed**.\nInvalid email or password.\n\nPlease try again by sending /start.");
        deleteSession($chatId); // Reset to avoid getting stuck
    }
    return;
}

// Fallback
sendMessage($chatId, "I didn't understand that Command.\nSend /start to login.");


// --- HELPERS ---

function updateSession($chatId, $state, $data) {
    global $pdo;
    $sql = "INSERT INTO bot_sessions (chat_id, state, temp_data) VALUES (?, ?, ?) 
            ON DUPLICATE KEY UPDATE state = ?, temp_data = ?";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$chatId, $state, $data, $state, $data]);
}

function deleteSession($chatId) {
    global $pdo;
    $stmt = $pdo->prepare("DELETE FROM bot_sessions WHERE chat_id = ?");
    $stmt->execute([$chatId]);
}

function sendMessage($chatId, $text) {
    global $apiUrl;
    $postData = [
        'chat_id' => $chatId, 
        'text' => $text,
        'parse_mode' => 'Markdown'
    ];
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $apiUrl . "sendMessage");
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_exec($ch);
    curl_close($ch);
}
?>
