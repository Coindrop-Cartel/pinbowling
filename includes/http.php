<?php
/**
 * HTTP Utilities and Header Management for the PinBowling backend.
 */

// Set global CORS headers to prevent NetworkErrors during preflighted requests (DELETE, PUT, etc.)
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-CSRF-TOKEN');

// Handle CORS preflight requests globally. This is required because custom 
// headers like X-CSRF-TOKEN trigger an OPTIONS request for ALL method types.
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

/**
 * Standardized JSON response handler.
 * @param mixed $data Data to encode.
 * @param int $status HTTP status code.
 */
function sendJson($data, $status = 200) {
    if (ob_get_length()) ob_clean();
    header('Content-Type: application/json');
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Reads and decodes JSON data from the request body.
 * @return array
 */
function getJsonInput() {
    $body = file_get_contents('php://input');
    return json_decode($body, true) ?: [];
}

/**
 * Helper to retrieve custom headers from various server environments.
 * Handles standard, lowercase, and REDIRECT_ prefixed variants (common in CGI/FastCGI).
 */
function getHeader($name) {
    static $headers_cache = null;
    if ($headers_cache === null) {
        $headers_cache = function_exists('getallheaders') ? getallheaders() : [];
    }
    
    $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    return $_SERVER[$serverKey] 
        ?? $headers_cache[$name] 
        ?? $headers_cache[strtolower($name)] 
        ?? $_SERVER["REDIRECT_$serverKey"] 
        ?? null;
}

/**
 * Verifies the CSRF token provided in the request header against the session.
 * State-changing methods (POST, PUT, DELETE) must provide a valid token.
 * 
 * @return bool
 */
function verifyCsrfToken() {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    // Safe methods do not require CSRF validation
    if (in_array($method, ['GET', 'HEAD', 'OPTIONS'])) {
        return true;
    }

    $providedToken = getHeader('X-CSRF-TOKEN');
    $sessionToken = $_SESSION['csrf_token'] ?? '';

    return !empty($providedToken) && hash_equals($sessionToken, $providedToken);
}

/**
 * Appends the current UI_VERSION to an asset path for cache-busting.
 * Converts /path/file.js to /v1.1.1/path/file.js
 * @param string $path Path to the asset (js/css).
 * @return string
 */
function versionedAsset($path) {
    global $uiVersion, $baseUrl;
    // Ensure baseUrl is at least an empty string if not defined
    $base = $baseUrl ?? '';
    $relativePath = ltrim(str_replace($base, '', $path), '/');
    return $base . '/v' . $uiVersion . '/' . $relativePath;
}