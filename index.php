<?php
/**
 * Main Entry Point & Router
 * 
 * This file handles routing for the application by delegating to the Router class.
 */
require_once __DIR__ . '/includes/bootstrap.php';

use App\Includes\Router;

// Make $uiVersion available from the container for legacy code
$container = $GLOBALS['container'];
$settings = $container->get(\App\Service\SettingsService::class);
$uiVersion = $settings->get('uiVersion');

// Ensure the main HTML entry point is never cached
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$requestUri = request()->getUri(); // use Request helper for consistency
$parsedUrl = parse_url($requestUri);
$path = $parsedUrl['path'] ?? '';
$query = $parsedUrl['query'] ?? '';

// 2. Setup Router
$scriptDir = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME']));
$baseUrl = rtrim($scriptDir, '/');
$router = new Router($baseUrl, $uiVersion);

// 3. Resolve Route
$routeInfo = $router->resolve($path, $query);

// 4. Determine if this is the home page (for hamburger menu conditional)
$isHomePage = $routeInfo['type'] === 'default';

// 5. Handle Route Outcome
switch ($routeInfo['type']) {
    case 'error':
        http_response_code($routeInfo['code']);
        echo '<main class="page-container card"><h1>404</h1><p>Page not found.</p></main>';
        exit;

    case 'redirect':
        header("Location: " . $routeInfo['location'], true, $routeInfo['status']);
        exit;

    case 'static':
        header('Content-Type: ' . $routeInfo['content_type']);
        readfile($routeInfo['file']);
        exit;

    case 'execute':
        include $routeInfo['file'];
        exit;

    case 'service':
        if (!empty($routeInfo['query'])) {
            parse_str($routeInfo['query'], $_GET);
        }
        include $routeInfo['file'];
        exit;

    case 'root':
        include $routeInfo['file'];
        exit;

    case 'default':
        // Default to home page
        $targetFile = __DIR__ . '/includes/pages/home.php';
        break;

    case 'page':
        $targetFile = $routeInfo['file'];
        break;

    default:
        // Fallback for safety
        $targetFile = __DIR__ . '/includes/pages/home.php';
        $isHomePage = true;
        break;
}

// 5. Capture page content
ob_start();
if (file_exists($targetFile)) {
    include $targetFile;
} else {
    http_response_code(404);
    echo '<main class="page-container card"><h1>404</h1><p>Page not found.</p></main>';
}
$pageContent = ob_get_clean();

// 6. Render Layout
if (request()->isAjax()) {
    // For partial loads via AJAX, only return the page content
    echo $pageContent;
} else {
    // Full page load
    include __DIR__ . '/includes/layout.php';
}
?>
