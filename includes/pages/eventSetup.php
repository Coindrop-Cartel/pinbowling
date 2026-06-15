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
          <div id="display-order" class="display-order"></div>
        </div>
        <div class="form-row">
          <label for="machine-name">Machine Name</label>
          <input type="text" id="machine-name" placeholder="Start typing machine name..." required />
        </div>
        <div class="grid-2">
          <div class="form-row">
            <label for="value-10">High Score Target</label>
            <input type="text" id="value-10" placeholder="e.g. 50,000,000" />
          </div>
          <div class="form-row">
            <label for="value-1">Low Score Target</label>
            <input type="text" id="value-1" placeholder="e.g. 5,000,000" />
          </div>
        </div>
        <div class="form-row" id="quick-fill-row" class="compact-quick-fill">
          <label>Quick Fill Strike Target (Venue Defaults)</label>
          <div class="flex gap-6">
            <button type="button" id="fill-easy" class="secondary btn-small flex-1" disabled>Easy</button>
            <button type="button" id="fill-med" class="secondary btn-small flex-1" disabled>Medium</button>
            <button type="button" id="fill-hard" class="secondary btn-small flex-1" disabled>Hard</button>
          </div>
        </div>
        <div id="preview-container" class="mt-10">
          <div class="flex-between mb-5">
            <label class="mb-0">Calculated Thresholds Preview:</label>
            <div class="flex gap-5">
              <button type="button" id="scaling-flat" class="secondary btn-small">Flat</button>
              <button type="button" id="scaling-curved" class="btn-standard btn-small">Curved</button>
            </div>
          </div>
          <div id="preview-values" class="notice">
            Enter a 10 score or a 1 score to preview values for 9–2.
          </div>
        </div>
        <div class="form-actions mt-20">
          <button type="submit" id="save-round-btn" disabled>Save</button>
          <button type="button" id="cancel-config-btn" class="secondary">Cancel</button>
        </div>
      </form>
    </section>

    <section class="card">
      <div class="flex-between mb-20">
        <h2>Event Layout</h2>
        <button type="button" id="add-target-btn" class="btn-standard">+ Add New Target</button>
      </div>
      <div id="list-empty" class="notice">Select a league and event to manage target scores.</div>
      <div id="rounds-list" class="hidden mb-20"></div>
      <div id="reorder-actions" class="form-actions hidden mt-10 justify-end">
        <button type="button" id="cancel-order-btn" class="secondary mr-8">Cancel</button>
        <button type="button" id="save-order-btn">Save</button>
      </div>
    </section>

    <div class="form-actions mt-20 center">
      <button type="button" id="done-setup-btn">DONE</button>
    </div>
  </main>