<?php
/**
 * HTTP Utilities and Header Management for the PinBowling backend.
 */

// Set global CORS headers to prevent NetworkErrors during preflighted requests (DELETE, PUT, etc.)
$allowedOrigin = \Configuration::getInstance()->get(['ALLOWED_ORIGIN'], '*');
header('Access-Control-Allow-Origin: ' . $allowedOrigin);
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-CSRF-TOKEN');

/**
 * Global helper to access the current Request object.
 * This allows legacy code to transition to the new Request object gradually.
 */
function request(): \App\Http\Request {
    static $request = null;
    if ($request === null) {
        $request = \App\Http\Request::createFromGlobals();
    }
    return $request;
}

// Handle CORS preflight requests globally. This is required because custom 
// headers like X-CSRF-TOKEN trigger an OPTIONS request for ALL method types.
if (request()->isOptions()) {
    (new \App\Http\Response())->sendAndExit();
}

/**
 * Standardized JSON response handler.
 * Now a backward-compatible wrapper around JsonResponse.
 * @param mixed $data Data to encode.
 * @param int $status HTTP status code.
 */
function sendJson($data, $status = 200) {
    (new \App\Http\JsonResponse($data, $status))->sendAndExit();
}

/**
 * Reads and decodes JSON data from the request body.
 * Now a backward-compatible wrapper around Request::getBodyParam().
 * @return array
 */
function getJsonInput() {
    return request()->getBody();
}

/**
 * Helper to retrieve custom headers from various server environments.
 * Now a backward-compatible wrapper around Request::getHeader().
 */
function getHeader($name) {
    return request()->getHeader($name);
}

/**
 * Verifies the CSRF token provided in the request header against the session.
 * State-changing methods (POST, PUT, DELETE) must provide a valid token.
 * 
 * @return bool
 */
function verifyCsrfToken() {
    $request = request();
    // Safe methods do not require CSRF validation
    if ($request->isSafeMethod()) {
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