<?php
/**
 * Authentication REST API Endpoint.
 * HTTP controller that delegates to the AuthService class.
 */

// Ensure we have the DI container and services available
if (!isset($GLOBALS['container'])) {
    require_once __DIR__ . '/../includes/bootstrap.php';
}

$container = $GLOBALS['container'];
$authService = $container->get(\App\Service\AuthService::class);

$task = $_GET['task'] ?? '';
$input = getJsonInput();

// Security Gatekeeper: Public tasks that do not require active session/secret
$publicTasks = ['me', 'login', 'forgot', 'reset_with_token'];
if (!in_array($task, $publicTasks)) {
    validateSessionOrSecret();
}

switch ($task) {
    case 'login':
        $username = $input['username'] ?? '';
        $password = $input['password'] ?? '';

        if (!$username || !$password) {
            sendJson(['error' => 'Username and password are required.'], 400);
        }

        $user = $authService->login($username, $password);
        if ($user) {
            \App\Service\AuthService::setCurrentUser($user);
            sendJson($user);
        } else {
            sendJson(['error' => 'Invalid username or password.'], 401);
        }
        break;

    case 'logout':
        \App\Service\AuthService::logout();
        sendJson(['success' => true]);
        break;

    case 'me':
        // Returns the currently logged-in user or null
        sendJson(\App\Service\AuthService::getCurrentUser());
        break;

    case 'register':
        $username = $input['username'] ?? '';
        $password = $input['password'] ?? '';
        $playerName = $input['playerName'] ?? '';
        $email = $input['email'] ?? null;
        $confirmClaim = $input['confirmClaim'] ?? false;

        if (!$username || !$password || !$playerName) {
            sendJson(['error' => 'Username, password, and player name are required.'], 400);
        }

        $result = $authService->register($username, $password, $playerName, $email, $confirmClaim);
        
        if (isset($result['error'])) {
            sendJson($result, $result['code']);
        } else {
            \App\Service\AuthService::setCurrentUser($result);
            sendJson($result);
        }
        break;

    case 'reset':
        $userId = $_GET['id'] ?? null;
        $newPassword = $input['password'] ?? '';

        if (!$userId || !$newPassword) {
            sendJson(['error' => 'User ID and new password are required.'], 400);
        }

        // Permission check: Admin can reset anyone, users can reset themselves
        $currentUser = \App\Service\AuthService::getCurrentUser();
        if (!$currentUser || ($currentUser['role'] !== 'admin' && $currentUser['id'] != $userId)) {
            sendJson(['error' => 'Unauthorized password reset.'], 403);
        }

        try {
            $authService->resetPassword((int)$userId, $newPassword);
            sendJson(['success' => true]);
        } catch (\Exception $e) {
            sendJson(['error' => 'Failed to reset password: ' . $e->getMessage()], 500);
        }
        break;

    case 'forgot':
        $email = $input['email'] ?? '';
        if (!$email) {
            sendJson(['error' => 'Email is required.'], 400);
        }
        
        $scriptDir = dirname(dirname($_SERVER['SCRIPT_NAME']));
        $baseUrl = (empty($_SERVER['HTTPS']) ? 'http' : 'https') . "://$_SERVER[HTTP_HOST]" . rtrim($scriptDir, '/\\') . "/index.php";

        $authService->forgotPassword($email, $baseUrl);
        sendJson(['success' => true]);
        break;

    case 'reset_with_token':
        $token = $input['token'] ?? '';
        $password = $input['password'] ?? '';
        if (!$token || !$password) {
            sendJson(['error' => 'Token and password are required.'], 400);
        }
        $success = $authService->resetWithToken($token, $password);
        if ($success) {
            sendJson(['success' => true]);
        } else {
            sendJson(['error' => 'Invalid or expired reset token.'], 400);
        }
        break;

    default:
        sendJson(['error' => 'Invalid authentication task.'], 400);
}

