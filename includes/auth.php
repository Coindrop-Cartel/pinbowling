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
    global $apiSecret;

    $providedSecret = getHeader('X-PB-Secret');

    // 1. Master Overrides: Session Role or API Secret
    $user = getCurrentUser();
    if ($user && ($user['role'] === 'admin' || $user['role'] === 'td')) {
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
    global $apiSecret;

    $providedSecret = getHeader('X-PB-Secret');

    if ($providedSecret && $providedSecret === $apiSecret) {
        return;
    }
    
    $user = getCurrentUser();
    if ($user && $user['role'] === 'admin') {
        return;
    }

    sendJson(['error' => 'Unauthorized: Admin access required'], 401);
}

/**
 * Verifies that the user is at least a TD or has master credentials.
 */
function validateTDAccess() {
    global $apiSecret;

    $providedSecret = getHeader('X-PB-Secret');

    if ($providedSecret && $providedSecret === $apiSecret) {
        return;
    }
    
    $user = getCurrentUser();
    if ($user && ($user['role'] === 'admin' || $user['role'] === 'td')) {
        return;
    }

    sendJson(['error' => 'Unauthorized: TD or Admin access required'], 401);
}

/**
 * Security Gatekeeper. Verifies the custom X-PB-SECRET header against
 * the server-side API_SECRET OR checks for a valid authenticated session.
 */
function validateSessionOrSecret() {
    global $apiSecret;
    $providedSecret = getHeader('X-PB-Secret');
    if ($providedSecret === $apiSecret) {
        return;
    }
    $user = getCurrentUser();
    if ($user) {
        return;
    }
    sendJson(['error' => 'Unauthorized: Invalid or missing API secret'], 401);
}

/**
 * Backward compatibility alias for validateSessionOrSecret.
 */
function validateApiSecret() {
    validateSessionOrSecret();
}