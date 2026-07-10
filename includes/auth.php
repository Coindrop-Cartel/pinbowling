<?php
/**
 * Authentication and Authorization helpers for the PinBowling backend.
 */

/**
 * Helper to get the currently authenticated user from the session.
 */
function getCurrentUser() {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    return $_SESSION['user'] ?? null;
}

/**
 * Checks if the current user has permission to manage a specific league.
 */
function canManageLeague($pdo, $leagueId) {
    $user = getCurrentUser();
    if (!$user) return false;
    if ($user['role'] === 'admin') return true;
    
    if ($user['role'] === 'td') {
        $stmt = $pdo->prepare("SELECT 1 FROM league_staff WHERE league_id = ? AND user_id = ?");
        $stmt->execute([$leagueId, $user['id']]);
        return (bool)$stmt->fetch();
    }
    return false;
}

/**
 * Validates access to a specific league.
 * Access is granted if the global admin secret is correct OR if the
 * provided league-specific password matches.
 */
function validateLeagueAccess($pdo, $leagueId) {
    $apiSecret = Configuration::getInstance()->getApiSecret();

    $providedSecret = getHeader('X-PB-Secret');

    // 1. Master Overrides: Session Role or API Secret
    $user = getCurrentUser();
    if ($user && ($user['role'] === 'admin' || $user['role'] === 'td')) {
        if (!verifyCsrfToken()) sendJson(['error' => 'CSRF validation failed'], 403);
        return;
    }

    if ($providedSecret && $providedSecret === $apiSecret) {
        return;
    }

    // If we reach here and it's a restricted action, we'll rely on the specific service logic
}

/**
 * Verifies that the provided credentials match the Global Admin Password or API Secret.
 * Used for system-wide modifications like master machine/player editing.
 */
function validateAdminAccess() {
    $apiSecret = Configuration::getInstance()->getApiSecret();

    $providedSecret = getHeader('X-PB-Secret');

    if ($providedSecret && $providedSecret === $apiSecret) {
        return;
    }
    
    $user = getCurrentUser();
    if ($user && $user['role'] === 'admin') {
        if (!verifyCsrfToken()) sendJson(['error' => 'CSRF validation failed'], 403);
        return;
    }

    sendJson(['error' => 'Unauthorized: Admin access required'], 401);
}

/**
 * Verifies that the user is at least a TD or has master credentials.
 */
function validateTDAccess() {
    $apiSecret = Configuration::getInstance()->getApiSecret();

    $providedSecret = getHeader('X-PB-Secret');

    if ($providedSecret && $providedSecret === $apiSecret) {
        return;
    }
    
    $user = getCurrentUser();
    if ($user && ($user['role'] === 'admin' || $user['role'] === 'td')) {
        if (!verifyCsrfToken()) sendJson(['error' => 'CSRF validation failed'], 403);
        return;
    }

    sendJson(['error' => 'Unauthorized: TD or Admin access required'], 401);
}

/**
 * Security Gatekeeper. Verifies the custom X-PB-SECRET header against
 * the server-side API_SECRET OR checks for a valid authenticated session.
 */
function validateSessionOrSecret() {
    $apiSecret = Configuration::getInstance()->getApiSecret();
    $providedSecret = getHeader('X-PB-Secret');
    if ($providedSecret === $apiSecret) {
        return;
    }
    $user = getCurrentUser();
    if ($user) {
        if (!verifyCsrfToken()) sendJson(['error' => 'CSRF validation failed'], 403);
        return;
    }
    sendJson(['error' => 'Unauthorized: Invalid or missing authentication'], 401);
}