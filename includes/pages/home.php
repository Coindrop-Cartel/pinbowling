<?php $pageTitle = 'Home'; ?>
<main class="page-container">
  <header class="hero-section">
    <!-- New main site logo -->
    <img src="images/main-site-logo-<?php echo strtolower($active['brand']); ?>.png" alt="<?php echo $siteBrand; ?>" class="main-site-logo">
 
    <!-- Format selection and action buttons in a card -->
    <div class="card hero-brand-selector">
      <p class="hero-intro-text"><?php echo $heroIntroText; ?></p>
      <div class="hero-brand-selector-inner"> <!-- Added a wrapper for the images to maintain flex gap -->
        <button type="button" class="hero-logo-nav hero-logo-nav-prev" data-testid="hero-logo-nav-prev" data-direction="-1" aria-label="Previous format"><</button>
        <div class="hero-logo-track" data-testid="hero-logo-track">
          <img src="images/pinbowling.png" class="hero-logo-btn" data-format="bowling" alt="PinBowling">
          <img src="images/pinbaseball.png" class="hero-logo-btn" data-format="baseball" alt="PinBaseball">
          <img src="images/pingolf.png" class="hero-logo-btn" data-format="golf" alt="PinGolf">
        </div>
        <button type="button" class="hero-logo-nav hero-logo-nav-next" data-testid="hero-logo-nav-next" data-direction="1" aria-label="Next format">></button>
      </div>
      <div class="hero-action-buttons" data-testid="hero-action-buttons">
        <a id="cta-play" href="<?php echo $baseUrl; ?>/play" class="btn-standard" data-route="PLAY"><?php echo $active['cta']; ?></a>
        <a id="cta-manage-leagues" href="<?php echo $baseUrl; ?>/leagues" class="btn-standard">Manage Leagues</a>
        <a id="cta-enter-scores" href="<?php echo $baseUrl; ?>/scores" class="btn-standard">Enter Scores</a>
      </div>
    </div>
  </header>
 
  <section class="card" data-testid="scoring-logic-card">
    <h2>Scoring Logic</h2>
    <p id="scoring-logic-text"><?php echo $active['logic']; ?></p>
  </section>
 
  <section class="card" data-testid="ai-disclosure-card">
    <h2>AI Disclosure</h2>
    <p><?php echo $aiDisclosure; ?></p>
  </section>
</main>