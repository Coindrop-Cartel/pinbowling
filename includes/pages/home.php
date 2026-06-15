<?php $pageTitle = 'Home'; ?>
<main class="page-container">
  <header class="hero-section">
    <!-- New main site logo -->
    <img src="images/main-site-logo-<?php echo strtolower($active['brand']); ?>.png" alt="<?php echo $siteBrand; ?>" class="main-site-logo">

    <!-- Format selection and action buttons in a card -->
    <div class="card hero-brand-selector">
      <p class="hero-intro-text"><?php echo $heroIntroText; ?></p>
      <div class="hero-brand-selector-inner"> <!-- Added a wrapper for the images to maintain flex gap -->
        <img src="images/pinbowling.png" class="hero-logo-btn" data-format="bowling" alt="PinBowling">
        <img src="images/pingolf.png" class="hero-logo-btn" data-format="golf" alt="PinGolf">
      </div>
      <div class="hero-action-buttons">
        <a href="<?php echo $baseUrl; ?>/play" class="btn-standard" data-route="PLAY"><?php echo $active['cta']; ?></a>
        <a href="<?php echo $baseUrl; ?>/leagues" class="btn-standard">Manage Leagues</a>
        <a href="<?php echo $baseUrl; ?>/scores" class="btn-standard">Enter Scores</a>
      </div>
    </div>
  </header>

  <section class="card">
    <h2>Scoring Logic</h2>
    <p id="scoring-logic-text"><?php echo $active['logic']; ?></p>
  </section>

  <section class="card">
    <h2>About the Project</h2>
    <p><?php echo $aboutProject; ?></p>
  </section>

  <section class="card">
    <h2>AI Disclosure</h2>
    <p><?php echo $aiDisclosure; ?></p>
  </section>
</main>