<?php
/**
 * JavaScript Configuration Bridge.
 * 
 * This file dynamically generates a JS script that passes server-side
 * configuration (UI version, debug mode) to the client-side scripts.
 * Secrets are no longer exposed client-side; API auth uses session cookies.
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

// Pass server-side metadata to global JS variables
echo "window.PB_UI_VERSION = " . json_encode($uiVersion) . ";\n";

// Expose CSRF token for API requests
echo "window.PB_CSRF_TOKEN = " . json_encode($_SESSION['csrf_token'] ?? '') . ";";

// Log the version to console if the user has debug mode enabled in their browser
echo "\nif (localStorage.getItem('pb_debug') === 'true') {";
echo "  console.log('[Config Bridge] Server delivered UI Version: ' + " . json_encode($uiVersion) . ");";
echo "}";