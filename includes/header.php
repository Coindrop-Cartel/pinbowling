<nav class="navbar">
  <div class="nav-container">
    <a href="<?php echo rtrim($baseUrl, '/') . '/'; ?>" class="nav-logo">
      <img src="<?php echo $baseUrl; ?>/images/logo.png" alt="PinBowling Logo">
      <span>PinBowling</span>
    </a>
    <ul class="nav-links">
      <li class="nav-item"><a href="<?php echo $baseUrl; ?>/play" class="nav-link" data-route="PLAY">Let's Bowl!</a></li>
      <li class="nav-item dropdown">
        <a href="javascript:void(0)" class="nav-link dropbtn">Leagues</a>
        <div class="dropdown-content">
          <a href="<?php echo $baseUrl; ?>/scores" class="nav-link" data-route="SCORES">Scores</a>
          <a href="<?php echo $baseUrl; ?>/leagues" class="nav-link" data-route="LEAGUES">Manage</a>
          <a href="<?php echo $baseUrl; ?>/standings" class="nav-link" data-route="STANDINGS">Scoreboard</a>
        </div>
      </li>
      <li class="nav-item dropdown">
        <a href="javascript:void(0)" class="nav-link dropbtn">Admin</a>
        <div class="dropdown-content">
          <a href="<?php echo $baseUrl; ?>/machines" class="nav-link" data-route="MACHINES">Machines</a>
          <a href="<?php echo $baseUrl; ?>/players" class="nav-link" data-route="PLAYERS">Players</a>
          <a href="<?php echo $baseUrl; ?>/locations" class="nav-link" data-route="LOCATIONS">Locations</a>
        </div>
      </li>
    </ul>
  </div>
</nav>