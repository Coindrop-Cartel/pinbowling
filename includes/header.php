<nav class="navbar">
  <div class="nav-container">
    <a href="<?php echo rtrim($baseUrl, '/') . '/'; ?>" class="nav-logo" data-route="HOME">
      <img src="<?php echo $baseUrl; ?>/images/<?php echo $active['logo']; ?>" alt="<?php echo $active['brand']; ?> Logo">
      <span><?php echo $active['brand']; ?></span>
    </a>
    <ul class="nav-links">
      <li class="nav-item"><a href="<?php echo $baseUrl; ?>/play" class="nav-link" data-route="PLAY"><?php echo $active['cta']; ?></a></li>
      <li class="nav-item dropdown">
        <a href="javascript:void(0)" class="nav-link dropbtn">Leagues</a>
        <div class="dropdown-content">
          <a href="<?php echo $baseUrl; ?>/scores" class="nav-link" data-route="SCORES">Scores</a>
          <a href="<?php echo $baseUrl; ?>/leagues" class="nav-link" data-route="LEAGUES">Manage</a>
          <a href="<?php echo $baseUrl; ?>/standings" class="nav-link" data-route="STANDINGS">Scoreboard</a>
        </div>
      </li>
      <li id="admin-nav-item" class="nav-item dropdown hidden">
        <a href="javascript:void(0)" class="nav-link dropbtn">Admin</a>
        <div class="dropdown-content">
          <a href="<?php echo $baseUrl; ?>/machines" class="nav-link" data-route="MACHINES">Machines</a>
          <a href="<?php echo $baseUrl; ?>/locations" class="nav-link" data-route="LOCATIONS">Locations</a>
          <a href="<?php echo $baseUrl; ?>/players" class="nav-link" data-route="PLAYERS">Players</a>
          <a id="nav-maintenance" href="<?php echo $baseUrl; ?>/management" class="nav-link" data-route="MAINTENANCE">Maintenance</a>
        </div>
      </li>
    </ul>
    <div id="auth-header-container" class="auth-header"></div>
  </div>
</nav>