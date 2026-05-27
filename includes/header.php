<header class="main-header">
  <div class="container header-content">
    <a href="index.php" class="logo">
      <img src="images/logo.png" alt="PinBowling Logo">
    </a>
    <nav class="taskbar">
      <?php
      $navItems = ['players.php' => 'Players', 'scores.php' => 'Scores', 'standings.php' => 'Standings', 'machines.php' => 'Machines'];
      foreach ($navItems as $url => $label):
        $active = (basename($_SERVER['PHP_SELF']) == $url) ? 'active' : '';
        echo "<a href=\"$url\" class=\"nav-item $active\">$label</a>";
      endforeach;
      ?>
    </nav>
  </div>
</header>