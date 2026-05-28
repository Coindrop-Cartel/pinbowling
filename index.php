<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PinBowling - Home</title>
  <link rel="stylesheet" href="styles.css" />
  <link rel="icon" type="image/png" href="images/logo.png" />
</head>
<body>
  <?php include 'includes/header.php'; ?>

  <main class="page-container">
    <header class="hero-section">
      <div class="hero-text">
        <h1>Welcome to PinBowling</h1>
        <p>A quick attempt to put together a basic way to track pinball scores in a bowling format. </p> 
        <p>This site is in ACTIVE DEVELOPMENT.  Use at your own risk.</p>
      </div>
      <img src="images/logo.png" alt="PinBowling Logo" class="hero-logo-img">
    </header>

    <section class="card">
      <h2>About the Project</h2>
      <p>The system attempts to map pinball scoring to bowling scoring. It calculates strikes, spares, and total scores following standard bowling rules based the target scores for each machine (its KINDA like pingolf). I'm not gonna explain how bowling scoring works, you are already on the internet you can figure it out.</p>
      <div class="form-actions" style="margin-top: 1.5rem; display: flex; gap: 1rem; flex-wrap: wrap;">
        <a href="#" class="btn-standard">Let's Bowl</a>
        <a href="leagues.php" class="btn-standard">Manage Leagues</a>
        <a href="scores.php" class="btn-standard">Enter Scores</a>
      </div>
    </section>

    <section class="card">
      <h2>Scoring Logic</h2>
      <p>Each machine has target scores corresponding to pin counts. Reaching the target on ball 1 is a strike (X). Reaching it on ball 2 is a 9-count spare (9/). Reaching it on ball 3 is a spare based on your cumulative progress from balls 1 & 2 (capped at 8/).</p>
      <p>Total scores are calculated following standard bowling rules, including strike and spare bonuses from subsequent frames.</p>
    </section>
  </main>
  <script src="js-config.php"></script>
<script type="module" src="scripts/main.js"></script>
</body>
</html>
