<?php
/**
 * JavaScript Configuration Bridge.
 * 
 * This file dynamically generates a JS script that passes server-side 
 * environment variables (API secret, Admin Password) to the client-side 
 * script.js, keeping them in sync with the .env file.
 */
require_once __DIR__ . '/includes/config.php';

// Light domain protection: Only serve if the referer matches our host
$referer = $_SERVER['HTTP_REFERER'] ?? '';
if ($referer && parse_url($referer, PHP_URL_HOST) !== $_SERVER['HTTP_HOST']) {
    header('HTTP/1.1 403 Forbidden');
    exit('Access denied');
}

header('Content-Type: application/javascript');
// Force the browser to fetch a fresh config bridge on every reload
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

// Pass the secrets from PHP/ENV to global JS variables
echo "window.PB_API_SECRET = " . json_encode($apiSecret) . ";\n";
echo "window.PB_ADMIN_PASSWORD = " . json_encode($adminPassword) . ";\n";
echo "window.PB_DEBUG_MODE = " . json_encode($debugMode) . ";\n";
echo "window.PB_UI_VERSION = " . json_encode($uiVersion) . ";";

// Log the version to console if the user has debug mode enabled in their browser
echo "\nif (localStorage.getItem('pb_debug_enabled') === 'true') {";
echo "  console.log('[Config Bridge] Server delivered UI Version: ' + " . json_encode($uiVersion) . ");";
echo "}";