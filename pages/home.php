<?php $pageTitle = 'Home'; ?>
<main class="page-container">
  <header class="hero-section">
    <div class="hero-text">
      <h1>Welcome to PinBowling</h1>
      <p>A quick attempt to put together a basic way to track pinball scores in a bowling format. </p> 
      <p>This site is in ACTIVE DEVELOPMENT. Use at your own risk.</p>
    </div>
    <img src="<?php echo $baseUrl; ?>/images/logo.png" alt="PinBowling Logo" class="hero-logo-img">
  </header>

  <section class="card">
    <h2>About the Project</h2>
    <p>The system attempts to map pinball scoring to bowling scoring. It calculates strikes, spares, and total scores following standard bowling rules based the target scores for each machine.</p>
    <div class="form-actions" style="margin-top: 1.5rem; display: flex; gap: 1rem; flex-wrap: wrap;">
      <a href="<?php echo $baseUrl; ?>/scores" class="btn-standard">Let's Bowl</a>
      <a href="<?php echo $baseUrl; ?>/leagues" class="btn-standard">Manage Leagues</a>
      <a href="<?php echo $baseUrl; ?>/scores" class="btn-standard">Enter Scores</a>
    </div>
  </section>

  <section class="card">
    <h2>Scoring Logic</h2>
    <p>Each machine has target scores corresponding to pin counts. Reaching the target on ball 1 is a strike (X). Reaching it on ball 2 is a 9-count spare (9/). Reaching it on ball 3 is a spare based on your cumulative progress from balls 1 & 2 (capped at 8/).</p>
    <p>Total scores are calculated following standard bowling rules, including strike and spare bonuses from subsequent frames.</p>
  </section>
</main>