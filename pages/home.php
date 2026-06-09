<?php $pageTitle = 'Home'; ?>
<main class="page-container">
  <header class="hero-section">
    <div class="hero-text">
      <div class="hero-brand-text">
        <h1 class="hero-brand-name"><?php echo $siteBrand; ?></h1>
        <p class="hero-subtitle"><small><b><?php echo $siteSlogan; ?></b></small></p>
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
    <div class="form-actions mb-20">
      <a href="<?php echo $baseUrl; ?>/play" class="btn-standard" data-route="PLAY"><?php echo $active['cta']; ?></a>
      <a href="<?php echo $baseUrl; ?>/leagues" class="btn-standard">Manage Leagues</a>
      <a href="<?php echo $baseUrl; ?>/scores" class="btn-standard">Enter Scores</a>
    </div>
  </section>

  <section class="card">
    <h2>Scoring Logic</h2>
    <p id="scoring-logic-text"><?php echo $active['logic']; ?></p>
  </section>

  <section class="card">
    <h2>AI Disclosure</h2>
    <p><?php echo $aiDisclosure; ?></p>
  </section>
</main>