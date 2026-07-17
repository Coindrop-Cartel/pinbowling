<?php $pageTitle = 'Event Setup'; ?>
  <main class="page-container">
    <!-- Current Selection Display -->
    <section class="card">
      <h2 data-testid="selection-card-title">Selection</h2>
      <div class="tournament-selector-container" data-testid="event-setup-tournament-selector-container"></div>
    </section>
 
    <header>
      <h1>Event Configuration</h1>
      <p>Define the machine sequence and target scores for this event.</p>
    </header>
 
    <section id="config-card" data-testid="config-card" class="card hidden">
      <h2 id="config-title" data-testid="config-title">Add New Target</h2>
      <form id="round-form" data-testid="round-form" autocomplete="off">
        <input type="hidden" id="order-number" data-testid="order-number-input" />
        <div class="form-row">
          <label>Sequence Order</label>
          <div id="display-order" data-testid="display-order-text" class="display-order"></div>
        </div>
        <div class="form-row">
          <label for="machine-name">Machine Name</label>
          <input type="text" id="machine-name" data-testid="machine-name-input" placeholder="Start typing machine name..." required />
        </div>
        <div class="grid-2">
          <div class="form-row">
            <label for="value-10">High Score Target</label>
            <input type="text" id="value-10" data-testid="value-10-input" placeholder="e.g. 50,000,000" />
          </div>
          <div class="form-row">
            <label for="value-1">Low Score Target</label>
            <input type="text" id="value-1" data-testid="value-1-input" placeholder="e.g. 5,000,000" />
          </div>
        </div>
        <div class="form-row" id="quick-fill-row" data-testid="quick-fill-row" class="compact-quick-fill">
          <label>Quick Fill Strike Target (Venue Defaults)</label>
          <div class="flex gap-6">
            <button type="button" id="fill-easy" data-testid="fill-easy-button" class="secondary btn-small flex-1" disabled>Easy</button>
            <button type="button" id="fill-med" data-testid="fill-med-button" class="secondary btn-small flex-1" disabled>Medium</button>
            <button type="button" id="fill-hard" data-testid="fill-hard-button" class="secondary btn-small flex-1" disabled>Hard</button>
          </div>
        </div>
        <div id="preview-container" data-testid="preview-container" class="mt-10">
          <div class="flex-between mb-5">
            <label class="mb-0">Calculated Thresholds Preview:</label>
            <div class="flex gap-5">
              <button type="button" id="scaling-flat" data-testid="scaling-flat-button" class="secondary btn-small">Flat</button>
              <button type="button" id="scaling-curved" data-testid="scaling-curved-button" class="btn-standard btn-small">Curved</button>
            </div>
          </div>
          <div id="preview-values" data-testid="preview-values-area" class="notice">
            Enter a 10 score or a 1 score to preview values for 9–2.
          </div>
        </div>
        <div class="form-actions mt-20">
          <button type="submit" id="save-round-btn" data-testid="save-round-button" disabled>Save</button>
          <button type="button" id="cancel-config-btn" data-testid="cancel-config-button" class="secondary">Cancel</button>
        </div>
      </form>
    </section>
 
    <section class="card" data-testid="event-layout-card">
      <div class="flex-between mb-20">
        <h2>Event Layout</h2>
        <button type="button" id="add-target-btn" data-testid="add-target-button" class="btn-standard">+ Add New Target</button>
      </div>
      <div id="list-empty" data-testid="rounds-list-empty-notice" class="notice">Select a league and event to manage target scores.</div>
      <div id="rounds-list" data-testid="rounds-list" class="hidden mb-20"></div>
      <div id="reorder-actions" data-testid="reorder-actions-container" class="form-actions hidden mt-10 justify-end">
        <button type="button" id="cancel-order-btn" data-testid="cancel-order-button" class="secondary mr-8">Cancel</button>
        <button type="button" id="save-order-btn" data-testid="save-order-button">Save</button>
      </div>
    </section>
 
    <div class="form-actions mt-20 center" data-testid="event-setup-global-actions">
      <button type="button" id="done-setup-btn" data-testid="done-setup-button">DONE</button>
      <button type="button" id="print-machines-btn" data-testid="print-machines-button" class="btn-standard">Print Machines</button>
    </div>
  </main>