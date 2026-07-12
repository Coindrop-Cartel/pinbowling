<?php
/**
 * Pre-render Auth State: To prevent FOUC (Flash of Unauthenticated Content),
 * we check the session immediately and render the logged-in UI on the server.
 */
$user = \App\Service\AuthService::getCurrentUser();
$role = $user['role'] ?? 'unregistered';
$isManagement = in_array($role, ['admin', 'td', 'player']);
$userId = $user ? "user-" . ($user['id'] ?? 'auth') : 'guest';
$displayName = htmlspecialchars($user['player_name'] ?? ($user['username'] ?? 'User'));
?>

<nav class="navbar">
  <div class="nav-container">
    <a href="<?php echo rtrim($baseUrl, '/') . '/'; ?>" class="nav-logo" data-route="HOME">
      <img src="<?php echo versionedAsset($baseUrl . '/images/' . ($active['headerLogo'] ?? $active['logo'])); ?>" alt="<?php echo $active['brand']; ?> Logo">
      <span><?php echo $active['brand']; ?></span>
    </a>
    <ul class="nav-links">
      <li id="play-nav-item" class="nav-item"><a href="<?php echo $baseUrl; ?>/play" class="nav-link" data-route="PLAY"><?php echo $active['cta']; ?></a></li>
      <li id="leagues-nav-item" class="nav-item dropdown">
        <a href="javascript:void(0)" class="nav-link dropbtn">Leagues</a>
        <div class="dropdown-content">
          <a id="nav-scores" href="<?php echo $baseUrl; ?>/scores" class="nav-link" data-route="SCORES">Scores</a>
          <a id="nav-leagues" href="<?php echo $baseUrl; ?>/leagues" class="nav-link" data-route="LEAGUES">Manage</a>
          <a id="nav-standings" href="<?php echo $baseUrl; ?>/standings" class="nav-link" data-route="STANDINGS">Scoreboard</a>
        </div>
      </li>
      <li id="admin-nav-item" class="nav-item dropdown <?php echo $isManagement ? '' : 'hidden'; ?>">
        <a href="javascript:void(0)" class="nav-link dropbtn">Admin</a>
        <div class="dropdown-content">
          <a id="nav-machines" href="<?php echo $baseUrl; ?>/machines" class="nav-link" data-route="MACHINES">Machines</a>
          <a id="nav-locations" href="<?php echo $baseUrl; ?>/locations" class="nav-link" data-route="LOCATIONS">Locations</a>
          <a id="nav-players" href="<?php echo $baseUrl; ?>/players" class="nav-link" data-route="PLAYERS">Players</a>
          <a id="nav-teams" href="<?php echo $baseUrl; ?>/teams" class="nav-link" data-route="TEAMS">Teams</a>
          <a id="nav-maintenance" href="<?php echo $baseUrl; ?>/management" class="nav-link" data-route="MAINTENANCE">Maintenance</a>
        </div>
      </li>
    </ul>
    <div id="auth-header-container" class="auth-header" data-auth-state="<?php echo $userId; ?>">
      <?php if ($user): ?>
        <div class="auth-header-wrapper">
          <span class="auth-user-greeting">Hi, <?php echo $displayName; ?></span>
          <button id="header-logout-btn">Log Out</button>
        </div>
      <?php else: ?>
        <button id="header-login-btn">Login</button>
      <?php endif; ?>
    </div>
  </div>
</nav>

<script src='https://storage.ko-fi.com/cdn/scripts/overlay-widget.js'></script>
<script>
  kofiWidgetOverlay.draw('kylevoorhees', {
    'type': 'floating-chat',
    'floating-chat.donateButton.text': 'Tip',
    'floating-chat.donateButton.background-color': '#323842',
    'floating-chat.donateButton.text-color': '#fff'
  });
</script>