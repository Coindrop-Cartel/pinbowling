<?php
require_once __DIR__ . '/config.php';

// Light domain protection: Only serve if the referer matches our host
$referer = $_SERVER['HTTP_REFERER'] ?? '';
if ($referer && parse_url($referer, PHP_URL_HOST) !== $_SERVER['HTTP_HOST']) {
    header('HTTP/1.1 403 Forbidden');
    exit('Access denied');
}

header('Content-Type: application/javascript');
// Pass the secrets from PHP/ENV to global JS variables
echo "window.PB_API_SECRET = " . json_encode($API_SECRET) . ";\n";
echo "window.PB_ADMIN_PASSWORD = " . json_encode($ADMIN_PASSWORD) . ";";