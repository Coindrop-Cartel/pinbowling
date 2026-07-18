<?php

namespace App\Http;

use App\Includes\Container;

/**
 * Base Controller for REST API endpoints.
 */
abstract class ApiController {
    protected Container $container;
    protected string $method;
    protected ?string $task;
    protected array $input;

    public function __construct(Container $container) {
        $this->container = $container;
        $this->method = $_SERVER['REQUEST_METHOD'];
        $this->task = $_GET['task'] ?? $_GET['action'] ?? null;
        $this->input = getJsonInput();
    }

    /**
     * Dispatches the API request, performing access validation, execution,
     * and unified error/exception formatting.
     */
    public function dispatch(): void {
        try {
            $this->validateAccess();
            $this->handle();
        } catch (\PDOException $e) {
            if (isset($e->errorInfo[1]) && $e->errorInfo[1] === 1062) {
                $this->sendError('Conflict: Database constraint violation (duplicate entry).', 409);
            }
            $this->sendError($e->getMessage(), 500);
        } catch (\Exception $e) {
            $code = $e->getCode();
            if ($code < 400 || $code > 599) {
                $code = 400;
            }
            $this->sendError($e->getMessage(), $code);
        } catch (\Throwable $e) {
            $this->sendError('Internal server error: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Override in concrete controllers to enforce authentication checks.
     */
    protected function validateAccess(): void {
        // Default: Open access. Specific endpoints should override this.
    }

    /**
     * Abstract execution entry point implemented by each concrete API controller.
     */
    abstract protected function handle(): void;

    /**
     * Send standard JSON response.
     */
    protected function sendJson($data, int $statusCode = 200): void {
        sendJson($data, $statusCode);
    }

    /**
     * Send standard JSON error response.
     */
    protected function sendError(string $message, int $statusCode = 400): void {
        sendJson(['error' => $message], $statusCode);
    }

    /**
     * Wrapper for admin checks.
     */
    protected function validateAdminAccess(): void {
        validateAdminAccess();
    }

    /**
     * Wrapper for TD checks.
     */
    protected function validateTDAccess(): void {
        validateTDAccess();
    }

    /**
     * Wrapper for session/secret checks.
     */
    protected function validateSessionOrSecret(): void {
        validateSessionOrSecret();
    }
}
