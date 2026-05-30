<?php
/**
 * Main Entry Point & Router
 * 
 * This file handles routing for the application. It looks for requested 
 * pages within the /pages directory. If no specific page is requested, 
 * it renders the Home page content.
 */
require_once __DIR__ . '/includes/config.php';

// 1. Parse the request path
$requestUri = $_SERVER['REQUEST_URI'] ?? '';
$path = parse_url($requestUri, PHP_URL_PATH);

// 2. Calculate the route relative to the script's directory
// This ensures it works whether the app is in the root or a subfolder
$baseDir = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\');
$baseUrl = $baseDir ?: '';
$route = trim(substr($path, strlen($baseDir)), '/');

$targetFile = __DIR__ . '/pages/home.php'; // Default content

if ($route !== '') {
    $pageName = (strpos($route, '.php') === false) ? $route . '.php' : $route;
    $potentialFile = __DIR__ . '/pages/' . basename($pageName);

    if (file_exists($potentialFile)) {
        $targetFile = $potentialFile;
    }
}

// 4. Capture page content
ob_start();
if (file_exists($targetFile)) {
    include $targetFile;
} else {
    http_response_code(404);
    echo '<main class="page-container card"><h1>404</h1><p>Page not found.</p></main>';
}
$pageContent = ob_get_clean();

// 5. Render Layout
include __DIR__ . '/includes/layout.php';
?>
