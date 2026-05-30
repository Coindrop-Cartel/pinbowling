<nav class="navbar">
  <div class="nav-container">
    <a href="<?php echo $baseUrl; ?>/" class="nav-logo">
      <img src="<?php echo $baseUrl; ?>/images/logo.png" alt="PinBowling Logo">
      <span>PinBowling</span>
    </a>
    <ul class="nav-links">
      <li class="nav-item"><a href="#" class="nav-link">Lets Bowl!</a></li>
      <li class="nav-item dropdown">
        <a href="javascript:void(0)" class="nav-link dropbtn">Leagues</a>
        <div class="dropdown-content">
          <a href="<?php echo $baseUrl; ?>/scores">Play</a>
          <a href="<?php echo $baseUrl; ?>/leagues">Manage</a>
          <a href="<?php echo $baseUrl; ?>/standings">Scoreboard</a>
        </div>
      </li>
      <li class="nav-item dropdown">
        <a href="javascript:void(0)" class="nav-link dropbtn">Admin</a>
        <div class="dropdown-content">
          <a href="<?php echo $baseUrl; ?>/machines">Machines</a>
          <a href="<?php echo $baseUrl; ?>/players">Players</a>
          <a href="<?php echo $baseUrl; ?>/locations">Locations</a>
        </div>
      </li>
    </ul>
  </div>
</nav>