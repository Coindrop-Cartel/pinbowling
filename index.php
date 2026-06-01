<?php
/**
 * Main Entry Point & Router
 * 
 * This file handles routing for the application. It looks for requested 
 * pages within the /pages directory. If no specific page is requested, 
 * it renders the Home page content.
 */
require_once __DIR__ . '/includes/config.php';

// Ensure the main HTML entry point is never cached so that 
// cache-busting asset URLs (?v=...) are always seen by the browser.
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

// 1. Parse the request path
$requestUri = $_SERVER['REQUEST_URI'] ?? '';
$path = parse_url($requestUri, PHP_URL_PATH);

// 2. Calculate the route relative to the script's directory
// This ensures it works whether the app is in the root or a subfolder
$scriptDir = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME']));
$baseDir = rtrim($scriptDir, '/');
$baseUrl = $baseDir;
$route = trim(substr($path, strlen($baseDir)), '/');

// 3. Handle Versioned Path Segments (Cache Busting)
// If the route starts with a version pattern (e.g., v1.1.1/scripts/main.js), 
// we strip the version segment to find the real file.
if (preg_match('/^v[0-9.]+\/(.*)$/', $route, $matches)) {
    $realPath = $matches[1];
    $fullPath = __DIR__ . '/' . $realPath;

    $ext = pathinfo($fullPath, PATHINFO_EXTENSION);

    if (file_exists($fullPath) && !is_dir($fullPath)) {
        if ($ext !== 'php') {
            // If the real path points to a static asset (non-PHP), serve it directly.
            $mimes = [
                'css' => 'text/css',
                'js'  => 'application/javascript',
                'png' => 'image/png',
                'jpg' => 'image/jpeg',
                'jpeg'=> 'image/jpeg',
                'svg' => 'image/svg+xml',
                'ico' => 'image/x-icon'
            ];
            header('Content-Type: ' . ($mimes[$ext] ?? 'application/octet-stream'));
            readfile($fullPath);
            exit;
        } else {
            // Execute and exit for versioned PHP assets (like js-config.php)
            include $fullPath;
            exit;
        }
    }
    $route = $realPath; // Update route for .php files like js-config.php
}

$targetFile = __DIR__ . '/pages/home.php'; // Default content

if ($route !== '') {
    // If the route is explicitly "index" or "index.php", redirect to the clean base URL
    if ($route === 'index' || $route === 'index.php') {
        header("Location: " . rtrim($baseUrl, '/') . "/", true, 301);
        exit;
    }

    // Map the route to the /pages directory
    $pageName = (strpos($route, '.php') === false) ? $route . '.php' : $route;
    $pagesFile = __DIR__ . '/pages/' . basename($pageName);
    $rootFile = __DIR__ . '/' . basename($pageName);

    if (file_exists($pagesFile)) {
        $targetFile = $pagesFile;
    } elseif (file_exists($rootFile)) {
        // Allow routing to root-level PHP files (like js-config.php)
        $targetFile = $rootFile;
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
