<?php $pageTitle = 'Home'; ?>
<main class="page-container">
  <header class="hero-section">
    <!-- Format selection and action buttons in a card -->
    <div class="card hero-brand-selector">
      <div class="hero-brand-selector-inner"> <!-- Added a wrapper for the images to maintain flex gap -->
        <button type="button" class="hero-logo-nav hero-logo-nav-prev" data-testid="hero-logo-nav-prev" data-direction="-1" aria-label="Previous format"><</button>
        <div class="hero-logo-track" data-testid="hero-logo-track">
          <img src="images/pinbowling.png" class="hero-logo-btn" data-format="bowling" alt="PinBowling">
          <img src="images/pinbaseball.png" class="hero-logo-btn" data-format="baseball" alt="PinBaseball">
          <img src="images/pingolf.png" class="hero-logo-btn" data-format="golf" alt="PinGolf">
        </div>
        <button type="button" class="hero-logo-nav hero-logo-nav-next" data-testid="hero-logo-nav-next" data-direction="1" aria-label="Next format">></button>
      </div>
      <p class="hero-intro-text"><?php echo $heroIntroText; ?></p>
    </div>
  </header>
 
<details name="home-accordion" class="card accordion-card" data-testid="scoring-logic-card">
    <summary><h2>Scoring Logic</h2></summary>
    <div class="accordion-content">
      <p id="scoring-logic-text"><?php echo $active['logic']; ?></p>
    </div>
  </details>
 
  <details name="home-accordion" class="card accordion-card" data-testid="ai-disclosure-card">
    <summary><h2>AI Disclosure</h2></summary>
    <div class="accordion-content">
      <p><?php echo $aiDisclosure; ?></p>
    </div>
  </details>
</main>