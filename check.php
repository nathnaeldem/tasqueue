<?php
require 'server/api/db.php';
$stmt = $pdo->query('SHOW COLUMNS FROM tasks');
$cols = $stmt->fetchAll(PDO::FETCH_ASSOC);
foreach ($cols as $c) {
    echo $c['Field'] . ' : ' . $c['Type'] . "\n";
}
