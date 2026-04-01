<?php
require 'api/db.php';

// Bot Token (Replace with yours)
$botToken = '8288585533:AAENfZ1Qo2sCtZGq_WjcRLnqRVU1DjAopPg'; 
$apiUrl = "https://api.telegram.org/bot{$botToken}/";

echo "Starting Telegram Bot Polling...\n";

$updateId = 0;

while (true) {
    // Long polling
    $url = $apiUrl . "getUpdates?offset=" . ($updateId + 1) . "&timeout=30";
    $response = file_get_contents($url);
    $data = json_decode($response, true);

    if ($data && $data['ok']) {
        foreach ($data['result'] as $update) {
            $updateId = $update['update_id'];
            
            if (isset($update['message'])) {
                $chatId = $update['message']['chat']['id'];
                $text = trim($update['message']['text'] ?? '');
                
                if ($text === '/start') {
                    // Send keyboard with Web App Button
                    $keyboard = [
                        'keyboard' => [
                            [
                                [
                                    'text' => '📱 Login to Lemikura', 
                                    'web_app' => ['url' => 'https://f75f-196-189-183-176.ngrok-free.app/telegram-login'] 
                                ]
                            ]
                        ],
                        'resize_keyboard' => true
                    ];
                    
                    // Note: URL must be HTTPS. 
                    // I am using a placeholder URL. USER MUST REPLACE THIS WITH THEIR NGROK/HTTPS URL.
                    
                    sendMessage($chatId, "Welcome! Click the button below to link your account.", $keyboard);
                } 
                // Removed old text login logic for clarity, or can keep as fallback.
                elseif (strpos($text, 'login ') === 0) {
                    $parts = explode(' ', $text);
                    if (count($parts) >= 3) {
                        $email = $parts[1];
                        $password = $parts[2];
                        
                        // Verify Logic
                        // NOTE: In production, do not send passwords like this. It's for the demo/dev request.
                        $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
                        $stmt->execute([$email]);
                        $user = $stmt->fetch();

                        if ($user && password_verify($password, $user['password'])) {
                            // Update user with Chat ID
                            $upd = $pdo->prepare("UPDATE users SET telegram_chat_id = ? WHERE id = ?");
                            $upd->execute([$chatId, $user['id']]);
                            sendMessage($chatId, "✅ Login Successful! You will now receive task notifications here.");
                        } else {
                            sendMessage($chatId, "❌ Invalid email or password.");
                        }
                    } else {
                        sendMessage($chatId, "Format error. Use: login email password");
                    }
                }
                else {
                     sendMessage($chatId, "Unknown command. Send /start to begin.");
                }
            }
        }
    }
    
    sleep(1);
}

function sendMessage($chatId, $text, $keyboard = null) {
    global $apiUrl;
    $postData = ['chat_id' => $chatId, 'text' => $text];
    if ($keyboard) {
        $postData['reply_markup'] = json_encode($keyboard);
    }
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $apiUrl . "sendMessage");
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_exec($ch);
    curl_close($ch);
}
?>
