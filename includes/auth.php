<?php
/**
 * Authentication and Authorization helpers for the PinBowling backend.
 */

/**
 * Consolidates the common routing security checks.
 *
 * @param array $allowedRoles If empty, permits any authenticated role.
 * @param string $unauthorizedMessage Response message for 401.
 */
function authorizeRequest(array $allowedRoles, string $unauthorizedMessage) {
    $apiSecret = Configuration::getInstance()->getApiSecret();
    $providedSecret = getHeader('X-PB-Secret');

    if ($providedSecret && $providedSecret === $apiSecret) {
        return;
    }

    $user = \App\Service\AuthService::getCurrentUser();
    if ($user && (empty($allowedRoles) || in_array($user['role'], $allowedRoles))) {
        if (!verifyCsrfToken()) {
            sendJson(['error' => 'CSRF validation failed'], 403);
        }
        return;
    }

    sendJson(['error' => $unauthorizedMessage], 401);
}

/**
 * Verifies that the provided credentials match the Global Admin Password or API Secret.
 * Used for system-wide modifications like master machine/player editing.
 */
function validateAdminAccess() {
    authorizeRequest(['admin'], 'Unauthorized: Admin access required');
}

/**
 * Verifies that the user is at least a TD or has master credentials.
 */
function validateTDAccess() {
    authorizeRequest(['admin', 'td'], 'Unauthorized: TD or Admin access required');
}

/**
 * Security Gatekeeper. Verifies the custom X-PB-SECRET header against
 * the server-side API_SECRET OR checks for a valid authenticated session.
 */
function validateSessionOrSecret() {
    authorizeRequest([], 'Unauthorized: Invalid or missing authentication');
}