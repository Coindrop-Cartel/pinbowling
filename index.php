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
$parsedUrl = parse_url($requestUri);
$path = $parsedUrl['path'] ?? '';
$query = $parsedUrl['query'] ?? '';

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
    $fullPath = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, __DIR__ . '/' . $realPath);

    $ext = pathinfo($fullPath, PATHINFO_EXTENSION);
    
    // If the file is missing but has a static asset extension, don't fall through to routing.
    // This prevents serving an HTML page for a missing image/script/style, which
    // causes "Blocked because of disallowed MIME type" and console errors.
    $staticExts = ['css', 'js', 'png', 'jpg', 'jpeg', 'svg', 'ico', 'webp', 'map'];
    if (!file_exists($fullPath) && in_array(strtolower($ext), $staticExts)) {
        http_response_code(404);
        exit;
    }

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

// 3.5 Authorization Guard for Management Routes
// Prevent unauthorized users from loading management-only HTML templates
$managementRoutes = ['config', 'machines', 'teams'];
$checkRoute = str_replace('.php', '', $route);
if (in_array($checkRoute, $managementRoutes)) {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    $user = getCurrentUser();
    if (!$user || ($user['role'] !== 'admin' && $user['role'] !== 'td')) {
        header("Location: " . rtrim($baseUrl, '/') . "/");
        exit;
    }
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
    
    // Look for the file in /pages, /service, or the root, preserving subdirectories
    $pagesFile = __DIR__ . '/pages/' . $pageName;
    $serviceFile = __DIR__ . '/' . $pageName; // Handles service/authService.php etc.
    $rootFile = __DIR__ . '/' . basename($pageName);

    if (file_exists($pagesFile)) {
        $targetFile = $pagesFile;
    } elseif (file_exists($serviceFile)) {
        // If index.php is acting as a router for service files,
        // ensure $_GET is populated from the original query string.
        if (!empty($query)) {
            parse_str($query, $_GET);
        }
        include $serviceFile;
        exit;
    } elseif (file_exists($rootFile)) {
        include $rootFile;
        exit;
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
if (isset($_SERVER['HTTP_X_REQUESTED_WITH']) && strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) === 'xmlhttprequest') {
    // For partial loads via AJAX, only return the page content
    echo $pageContent;
} else {
    // Full page load
    include __DIR__ . '/includes/layout.php';
}
?>
