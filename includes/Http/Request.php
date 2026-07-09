<?php

namespace App\Http;

/**
 * PSR-7 inspired Request object.
 * 
 * Encapsulates all HTTP request data (method, URI, query params, body, headers)
 * into a single object, replacing direct access to superglobals ($_SERVER, $_GET, etc.)
 * throughout the application.
 */
class Request {
    private string $method;
    private string $uri;
    private string $path;
    private string $queryString;
    private array $query;
    private array $body;
    private array $headers;
    private array $server;
    private array $cookies;

    /**
     * @param array $server  Typically $_SERVER
     * @param array $get     Typically $_GET
     * @param array $post    Typically $_POST (unused for JSON APIs, kept for compatibility)
     * @param array $cookies Typically $_COOKIE
     * @param string|null $rawBody  Raw request body (for JSON parsing)
     */
    public function __construct(
        array $server = [],
        array $get = [],
        array $post = [],
        array $cookies = [],
        ?string $rawBody = null
    ) {
        $this->server = $server;
        $this->method = strtoupper($server['REQUEST_METHOD'] ?? 'GET');
        $this->uri = $server['REQUEST_URI'] ?? '/';
        $this->cookies = $cookies;

        // Parse URI into path and query string
        $parsed = parse_url($this->uri);
        $this->path = $parsed['path'] ?? '/';
        $this->queryString = $parsed['query'] ?? '';

        // Parse query parameters
        $this->query = $get;
        if (!empty($this->queryString)) {
            parse_str($this->queryString, $parsedQuery);
            // Merge: $_GET takes precedence (already parsed by PHP)
            $this->query = array_merge($parsedQuery, $get);
        }

        // Parse JSON body
        $this->body = [];
        $rawBody = $rawBody ?? file_get_contents('php://input');
        if (!empty($rawBody)) {
            $decoded = json_decode($rawBody, true);
            if (is_array($decoded)) {
                $this->body = $decoded;
            }
        }

        // Extract headers from $_SERVER
        $this->headers = $this->extractHeaders($server);
    }

    /**
     * Create a Request from PHP superglobals.
     */
    public static function createFromGlobals(): self {
        return new self($_SERVER, $_GET, $_POST, $_COOKIE);
    }

    // ─── Method ────────────────────────────────────────────────────────

    public function getMethod(): string {
        return $this->method;
    }

    public function isMethod(string $method): bool {
        return $this->method === strtoupper($method);
    }

    public function isGet(): bool    { return $this->isMethod('GET'); }
    public function isPost(): bool   { return $this->isMethod('POST'); }
    public function isPut(): bool    { return $this->isMethod('PUT'); }
    public function isDelete(): bool { return $this->isMethod('DELETE'); }
    public function isOptions(): bool { return $this->isMethod('OPTIONS'); }

    /**
     * Whether the request method is safe (no side effects).
     * Per HTTP spec: GET, HEAD, OPTIONS, TRACE are safe methods.
     */
    public function isSafeMethod(): bool {
        return in_array($this->method, ['GET', 'HEAD', 'OPTIONS', 'TRACE']);
    }

    // ─── URI / Path ────────────────────────────────────────────────────

    public function getUri(): string {
        return $this->uri;
    }

    public function getPath(): string {
        return $this->path;
    }

    public function getQueryString(): string {
        return $this->queryString;
    }

    // ─── Query Parameters ──────────────────────────────────────────────

    public function getQuery(): array {
        return $this->query;
    }

    public function getQueryParam(string $key, $default = null) {
        return $this->query[$key] ?? $default;
    }

    public function getIntParam(string $key, int $default = 0): int {
        return isset($this->query[$key]) ? (int)$this->query[$key] : $default;
    }

    // ─── Body ───────────────────────────────────────────────────────────

    public function getBody(): array {
        return $this->body;
    }

    public function getBodyParam(string $key, $default = null) {
        return $this->body[$key] ?? $default;
    }

    /**
     * Get a parameter from either query or body (query takes precedence).
     */
    public function get(string $key, $default = null) {
        return $this->query[$key] ?? $this->body[$key] ?? $default;
    }

    // ─── Headers ───────────────────────────────────────────────────────

    public function getHeaders(): array {
        return $this->headers;
    }

    public function getHeader(string $name, ?string $default = null): ?string {
        // Normalize the lookup key
        $key = strtolower(str_replace('-', '_', $name));
        return $this->headers[$key] ?? $default;
    }

    public function hasHeader(string $name): bool {
        $key = strtolower(str_replace('-', '_', $name));
        return isset($this->headers[$key]);
    }

    /**
     * Check if this is an AJAX/XHR request.
     */
    public function isAjax(): bool {
        return strtolower($this->getHeader('X-Requested-With', '')) === 'xmlhttprequest';
    }

    // ─── Cookies ───────────────────────────────────────────────────────

    public function getCookies(): array {
        return $this->cookies;
    }

    public function getCookie(string $name, $default = null) {
        return $this->cookies[$name] ?? $default;
    }

    // ─── Server ────────────────────────────────────────────────────────

    public function getServerParam(string $key, $default = null) {
        return $this->server[$key] ?? $default;
    }

    // ─── Private Helpers ───────────────────────────────────────────────

    /**
     * Extract HTTP headers from the $_SERVER superglobal.
     * Handles standard HTTP_ prefixed keys, REDIRECT_ prefixed (CGI/FastCGI),
     * and CONTENT_TYPE / CONTENT_TYPE special cases.
     */
    private function extractHeaders(array $server): array {
        $headers = [];

        // Use getallheaders() if available (Apache)
        if (function_exists('getallheaders')) {
            foreach (getallheaders() as $name => $value) {
                $key = strtolower(str_replace('-', '_', $name));
                $headers[$key] = $value;
            }
        }

        // Also scan $_SERVER for HTTP_ prefixed keys
        foreach ($server as $key => $value) {
            if (strpos($key, 'HTTP_') === 0) {
                $normalized = strtolower(str_replace('_', '-', substr($key, 5)));
                // Store both underscore and dash variants for flexible lookup
                $headers[str_replace('-', '_', $normalized)] = $value;
            }
        }

        // Handle CONTENT_TYPE and CONTENT_LENGTH (no HTTP_ prefix in CGI)
        if (isset($server['CONTENT_TYPE'])) {
            $headers['content_type'] = $server['CONTENT_TYPE'];
        }
        if (isset($server['CONTENT_LENGTH'])) {
            $headers['content_length'] = $server['CONTENT_LENGTH'];
        }

        // Handle REDIRECT_ prefixed variants (CGI/FastCGI)
        foreach ($server as $key => $value) {
            if (strpos($key, 'REDIRECT_HTTP_') === 0) {
                $normalized = strtolower(str_replace('_', '-', substr($key, 14)));
                $lookupKey = str_replace('-', '_', $normalized);
                if (!isset($headers[$lookupKey])) {
                    $headers[$lookupKey] = $value;
                }
            }
        }

        return $headers;
    }
}
