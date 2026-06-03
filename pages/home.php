<?php $pageTitle = 'Home'; ?>
<main class="page-container">
  <header class="hero-section" style="position: relative;">
    <div class="hero-text">
      <div class="hero-brand-selector">
        <img src="images/pinbowling.png" class="hero-logo-btn" data-format="bowling" alt="PinBowling">
        <div class="hero-brand-text" style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <h1 class="hero-brand-name"><?php echo $siteBrand; ?></h1>
          <p class="hero-subtitle"><?php echo $siteSlogan; ?></p>
        </div>
        <img src="images/pingolf.png" class="hero-logo-btn" data-format="golf" alt="PinGolf">
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
    <p><?php echo $active['logic']; ?></p>
  </section>
</main>