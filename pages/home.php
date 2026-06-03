<?php $pageTitle = 'Home'; ?>
<main class="page-container">
  <header class="hero-section" style="position: relative;">
    <div class="hero-text">
      <div class="hero-brand-text" style="text-align: center; margin-bottom: 2rem;">
        <h1 class="hero-brand-name" style="margin-bottom: 0.5rem;"><?php echo $siteBrand; ?></h1>
        <p class="hero-subtitle" style="font-size: 1.2rem; opacity: 0.8;"><?php echo $siteSlogan; ?></p>
      </div>
      <div class="hero-brand-selector">
        <img src="images/pinbowling.png" class="hero-logo-btn" data-format="bowling" alt="PinBowling">
        <img src="images/pingolf.png" class="hero-logo-btn" data-format="golf" alt="PinGolf">
      </div>
    </div>
  </header>

  <section class="card">
    <h2>About the Project</h2>
    <p><?php echo $aboutProject; ?></p>
    <div class="form-actions" style="margin-top: 1.5rem; display: flex; gap: 1rem; flex-wrap: wrap;">
      <a href="<?php echo $baseUrl; ?>/play" class="btn-standard" data-route="PLAY"><?php echo $active['cta']; ?></a>
      <a href="<?php echo $baseUrl; ?>/leagues" class="btn-standard">Manage Leagues</a>
      <a href="<?php echo $baseUrl; ?>/scores" class="btn-standard">Enter Scores</a>
    </div>
  </section>

  <section class="card">
    <h2>Scoring Logic</h2>
    <p id="scoring-logic-text"><?php echo $active['logic']; ?></p>
  </section>
</main>