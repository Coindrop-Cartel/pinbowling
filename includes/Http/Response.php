<?php

namespace App\Http;

/**
 * PSR-7 inspired Response object.
 * 
 * Encapsulates HTTP response data (status code, headers, body)
 * into a single object, replacing direct calls to header() and echo
 * throughout the application.
 */
class Response {
    protected int $statusCode;
    protected string $reasonPhrase;
    protected array $headers = [];
    protected string $body = '';

    /**
     * Standard HTTP status codes and their reason phrases.
     */
    private static array $statusTexts = [
        200 => 'OK',
        201 => 'Created',
        301 => 'Moved Permanently',
        302 => 'Found',
        400 => 'Bad Request',
        401 => 'Unauthorized',
        403 => 'Forbidden',
        404 => 'Not Found',
        405 => 'Method Not Allowed',
        409 => 'Conflict',
        500 => 'Internal Server Error',
    ];

    public function __construct(int $statusCode = 200, string $body = '', array $headers = []) {
        $this->statusCode = $statusCode;
        $this->reasonPhrase = self::$statusTexts[$statusCode] ?? '';
        $this->body = $body;
        foreach ($headers as $name => $value) {
            $this->headers[$name] = (array)$value;
        }
    }

    // ─── Status ─────────────────────────────────────────────────────────

    public function getStatusCode(): int {
        return $this->statusCode;
    }

    public function getReasonPhrase(): string {
        return $this->reasonPhrase;
    }

    public function withStatus(int $code, string $reasonPhrase = ''): self {
        $new = clone $this;
        $new->statusCode = $code;
        $new->reasonPhrase = $reasonPhrase ?: (self::$statusTexts[$code] ?? '');
        return $new;
    }

    // ─── Headers ────────────────────────────────────────────────────────

    public function getHeaders(): array {
        return $this->headers;
    }

    public function hasHeader(string $name): bool {
        return isset($this->headers[$name]);
    }

    public function getHeader(string $name): array {
        return $this->headers[$name] ?? [];
    }

    public function getHeaderLine(string $name): string {
        return implode(', ', $this->getHeader($name));
    }

    public function withHeader(string $name, string $value): self {
        $new = clone $this;
        $new->headers[$name] = [$value];
        return $new;
    }

    public function withAddedHeader(string $name, string $value): self {
        $new = clone $this;
        $new->headers[$name][] = $value;
        return $new;
    }

    // ─── Body ───────────────────────────────────────────────────────────

    public function getBody(): string {
        return $this->body;
    }

    public function withBody(string $body): self {
        $new = clone $this;
        $new->body = $body;
        return $new;
    }

    // ─── Sending ────────────────────────────────────────────────────────

    /**
     * Send the response to the client.
     * Sets status code, headers, and outputs the body.
     */
    public function send(): void {
        if (ob_get_length()) ob_clean();

        // Set status code
        http_response_code($this->statusCode);

        // Send headers
        foreach ($this->headers as $name => $values) {
            foreach ($values as $value) {
                header("{$name}: {$value}");
            }
        }

        // Output body
        echo $this->body;
    }

    /**
     * Send the response and terminate execution.
     */
    public function sendAndExit(): void {
        $this->send();
        exit;
    }
}
