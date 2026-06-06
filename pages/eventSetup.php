<?php $pageTitle = 'Event Setup'; ?>
  <main class="page-container">
    <!-- Current Selection Display -->
    <section class="card">
      <h2>Selection</h2>
      <div class="tournament-selector-container"></div>
    </section>

    <header>
      <h1>Event Configuration</h1>
      <p>Define the machine sequence and target scores for this event.</p>
    </header>

    <section id="config-card" class="card hidden">
      <h2 id="config-title">Add New Target</h2>
      <form id="round-form" autocomplete="off">
        <input type="hidden" id="order-number" />
        <div class="form-row">
          <label>Sequence Order</label>
          <div id="display-order" style="font-weight: bold; font-size: 1.2rem;"></div>
        </div>
        <div class="form-row">
          <label for="machine-name">Machine Name</label>
          <input type="text" id="machine-name" placeholder="Start typing machine name..." required />
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div class="form-row">
            <label for="value-10">High Score Target</label>
            <input type="text" id="value-10" placeholder="e.g. 50,000,000" />
          </div>
          <div class="form-row">
            <label for="value-1">Low Score Target</label>
            <input type="text" id="value-1" placeholder="e.g. 5,000,000" />
          </div>
        </div>
        <div class="form-row" id="quick-fill-row" style="margin-top: -10px; margin-bottom: 20px;">
          <label>Quick Fill Strike Target (Venue Defaults)</label>
          <div style="display: flex; gap: 10px;">
            <button type="button" id="fill-easy" class="secondary" style="flex: 1; padding: 8px; font-size: 0.8rem;" disabled>Easy</button>
            <button type="button" id="fill-med" class="secondary" style="flex: 1; padding: 8px; font-size: 0.8rem;" disabled>Medium</button>
            <button type="button" id="fill-hard" class="secondary" style="flex: 1; padding: 8px; font-size: 0.8rem;" disabled>Hard</button>
          </div>
        </div>
        <div id="preview-container" style="margin-top: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
            <label style="margin-bottom: 0;">Calculated Thresholds Preview:</label>
            <div style="display: flex; gap: 5px;">
              <button type="button" id="scaling-flat" class="secondary" style="padding: 4px 10px; font-size: 0.75rem;">Flat</button>
              <button type="button" id="scaling-curved" class="btn-standard" style="padding: 4px 10px; font-size: 0.75rem;">Curved</button>
            </div>
          </div>
          <div id="preview-values" class="notice">
            Enter a 10 score or a 1 score to preview values for 9–2.
          </div>
        </div>
        <div class="form-actions" style="margin-top: 20px;">
          <button type="submit" id="save-round-btn" disabled>Save</button>
          <button type="button" id="cancel-config-btn" class="secondary">Cancel</button>
        </div>
      </form>
    </section>

    <section class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h2>Event Layout</h2>
        <button type="button" id="add-target-btn" class="btn-standard">+ Add New Target</button>
      </div>
      <div id="list-empty" class="notice">Select a league and event to manage target scores.</div>
      <div id="rounds-list" class="hidden" style="margin-bottom: 1rem;"></div>
      <div id="reorder-actions" class="form-actions hidden" style="margin-top: 1rem; justify-content: flex-end;">
        <button type="button" id="cancel-order-btn" class="secondary" style="margin-right: 8px;">Cancel</button>
        <button type="button" id="save-order-btn">Save</button>
      </div>
    </section>

    <div class="form-actions" style="margin-top: 20px; display: flex; justify-content: center;">
      <button type="button" id="done-setup-btn">DONE</button>
    </div>
  </main>