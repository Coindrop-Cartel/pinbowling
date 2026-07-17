<?php

namespace App\Http;

/**
 * JsonResponse represents an HTTP response in JSON format.
 * 
 * Automatically sets the Content-Type header to application/json
 * and serializes the provided data structure into a JSON string body.
 */
class JsonResponse extends Response {
    private $data;

    public function __construct($data, int $statusCode = 200, array $headers = []) {
        $this->data = $data;
        $body = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
        
        // Ensure Content-Type is set to application/json
        if (!isset($headers['Content-Type']) && !isset($headers['content-type'])) {
            $headers['Content-Type'] = 'application/json; charset=utf-8';
        }

        parent::__construct($statusCode, $body, $headers);
    }

    /**
     * Get the original, unserialized data.
     */
    public function getData() {
        return $this->data;
    }
}
