<?php $pageTitle = 'Let\'s Bowl'; ?>
<main class="page-container">
  <header>
    <h1>Let's Bowl</h1>
    <p>Create an on-demand session. Pick a venue, choose your frames, and start bowling.</p>
  </header>

  <section class="card">
    <form id="quick-play-form" autocomplete="off">
      <div class="form-row">
        <label for="qp-event-name">Session Name</label>
        <input id="qp-event-name" type="text" placeholder="e.g., Friday Night Pins" style="width: 100%; box-sizing: border-box;" />
      </div>
      
      <div class="form-row">
        <label for="qp-location">Location</label>
        <select id="qp-location" required style="width: 100%; box-sizing: border-box;">
          <option value="">-- Select Venue --</option>
        </select>
      </div>

      <div style="display: flex; gap: 15px;">
        <div class="form-row" style="flex: 1;">
          <label for="qp-frames">Frames</label>
          <select id="qp-frames" style="width: 100%; box-sizing: border-box;">
            <option value="3">3 Frames</option>
            <option value="5">5 Frames</option>
            <option value="10" selected>10 Frames (Full Game)</option>
          </select>
        </div>
        <div class="form-row" style="flex: 1;">
          <label for="qp-difficulty">Difficulty</label>
          <select id="qp-difficulty" style="width: 100%; box-sizing: border-box;">
            <option value="easy">Easy</option>
            <option value="med" selected>Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
      </div>

      <div class="form-actions" style="margin-top: 20px;">
        <button type="submit" id="generate-qp-btn">Generate Frames</button>
      </div>
    </form>
  </section>
  <!-- Preview Section: Shown after frames are generated -->
  <section id="qp-preview-section" class="card hidden" style="margin-top: 20px;">
    <h2>Review Your Session</h2>
    <p class="hint">Adjust the order or target scores before starting. Once you start, the layout is locked.</p>
    <div id="qp-frames-list" style="margin-bottom: 20px;"></div>
    <div class="form-actions">
      <button id="finalize-qp-btn">Finalize & Start Bowling</button>
    </div>
  </section>
</main>