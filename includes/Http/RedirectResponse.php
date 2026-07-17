<?php

namespace App\Http;

/**
 * RedirectResponse represents an HTTP response that redirects the client to a new URL.
 */
class RedirectResponse extends Response {
    public function __construct(string $url, int $statusCode = 302, array $headers = []) {
        $headers['Location'] = $url;
        parent::__construct($statusCode, '', $headers);
    }
}
