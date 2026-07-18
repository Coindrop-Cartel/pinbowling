<?php
/**
 * Authentication REST API Endpoint.
 * HTTP controller that delegates to the AuthService class.
 */

// Ensure we have the DI container and services available
require_once __DIR__ . '/../includes/bootstrap.php';

use App\Http\ApiController;
use App\Service\AuthService;

class AuthController extends ApiController {
    private AuthService $authService;

    public function __construct($container) {
        parent::__construct($container);
        $this->authService = $container->get(AuthService::class);
    }

    protected function validateAccess(): void {
        $publicTasks = ['me', 'login', 'forgot', 'reset_with_token'];
        if (!in_array($this->task, $publicTasks)) {
            $this->validateSessionOrSecret();
        }
    }

    protected function handle(): void {
        switch ($this->task) {
            case 'login':
                $username = $this->input['username'] ?? '';
                $password = $this->input['password'] ?? '';

                if (!$username || !$password) {
                    $this->sendError('Username and password are required.', 400);
                }

                $user = $this->authService->login($username, $password);
                if ($user) {
                    AuthService::setCurrentUser($user);
                    $this->sendJson($user);
                } else {
                    $this->sendError('Invalid username or password.', 401);
                }
                break;

            case 'logout':
                AuthService::logout();
                $this->sendJson(['success' => true]);
                break;

            case 'me':
                $this->sendJson(AuthService::getCurrentUser());
                break;

            case 'register':
                $username = $this->input['username'] ?? '';
                $password = $this->input['password'] ?? '';
                $playerName = $this->input['playerName'] ?? '';
                $email = $this->input['email'] ?? null;
                $confirmClaim = $this->input['confirmClaim'] ?? false;

                if (!$username || !$password || !$playerName) {
                    $this->sendError('Username, password, and player name are required.', 400);
                }

                $result = $this->authService->register($username, $password, $playerName, $email, $confirmClaim);
                
                if (isset($result['error'])) {
                    $this->sendJson($result, $result['code']);
                } else {
                    AuthService::setCurrentUser($result);
                    $this->sendJson($result);
                }
                break;

            case 'reset':
                $userId = $_GET['id'] ?? null;
                $newPassword = $this->input['password'] ?? '';

                if (!$userId || !$newPassword) {
                    $this->sendError('User ID and new password are required.', 400);
                }

                $currentUser = AuthService::getCurrentUser();
                if (!$currentUser || ($currentUser['role'] !== 'admin' && $currentUser['id'] != $userId)) {
                    $this->sendError('Unauthorized password reset.', 403);
                }

                $this->authService->resetPassword((int)$userId, $newPassword);
                $this->sendJson(['success' => true]);
                break;

            case 'forgot':
                $email = $this->input['email'] ?? '';
                if (!$email) {
                    $this->sendError('Email is required.', 400);
                }
                
                $scriptDir = dirname(dirname($_SERVER['SCRIPT_NAME']));
                $baseUrl = (empty($_SERVER['HTTPS']) ? 'http' : 'https') . "://$_SERVER[HTTP_HOST]" . rtrim($scriptDir, '/\\') . "/index.php";

                $this->authService->forgotPassword($email, $baseUrl);
                $this->sendJson(['success' => true]);
                break;

            case 'reset_with_token':
                $token = $this->input['token'] ?? '';
                $password = $this->input['password'] ?? '';
                if (!$token || !$password) {
                    $this->sendError('Token and password are required.', 400);
                }
                $success = $this->authService->resetWithToken($token, $password);
                if ($success) {
                    $this->sendJson(['success' => true]);
                } else {
                    $this->sendError('Invalid or expired reset token.', 400);
                }
                break;

            default:
                $this->sendError('Invalid authentication task.', 400);
        }
    }
}

// Prevent immediate execution during unit testing
$container = $GLOBALS['container'];
if (!defined('PHPUNIT_RUNNING') || PHPUNIT_RUNNING !== true) {
    (new AuthController($container))->dispatch();
}
