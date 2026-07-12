<?php $pageTitle = 'Manage Machines'; ?>
  <main class="page-container">
    <header>
      <h1>Manage Machines</h1>
    </header>
 
    <section class="card" data-testid="machine-form-card">
      <h2 id="machine-form-title" data-testid="machine-form-title">Add New Machine</h2>
      <form id="machine-form" data-testid="machine-form" autocomplete="off">
        <input type="hidden" id="editing-machine-id" data-testid="editing-machine-id-input" value="" />
        <div class="form-row">
          <label for="machine-name">Machine Name</label>
          <input id="machine-name" data-testid="machine-name-input" type="text" placeholder="Enter machine name" required />
        </div>
        <div id="machine-metadata-row" data-testid="machine-metadata-row" class="form-row hidden grid-1-2">
          <div class="form-row">
            <label for="machine-year">Year</label>
            <select id="machine-year" data-testid="machine-year-select"></select>
          </div>
          <div class="form-row">
            <label for="machine-manufacturer">Manufacturer</label>
            <input id="machine-manufacturer" data-testid="machine-manufacturer-input" type="text" placeholder="e.g. Williams" />
          </div>
        </div>
        <div id="machine-baseline-scores-row" class="form-row hidden">
          <hr class="my-10">
          <h3>Baseline Target Scores</h3>
          <div class="form-row">
            <label for="baseline-format">Format</label>
            <select id="baseline-format">
              <option value="bowling">Bowling</option>
              <option value="golf">Golf</option>
              <option value="baseball">Baseball</option>
            </select>
          </div>
          <div class="form-row grid-1-3">
            <div class="form-row">
              <label for="baseline-easy">Easy</label>
              <input type="text" id="baseline-easy" placeholder="e.g. 0" />
            </div>
            <div class="form-row">
              <label for="baseline-med">Medium</label>
              <input type="text" id="baseline-med" placeholder="e.g. 0" />
            </div>
            <div class="form-row">
              <label for="baseline-hard">Hard</label>
              <input type="text" id="baseline-hard" placeholder="e.g. 0" />
            </div>
          </div>
        </div>
        <div class="form-actions hidden" data-testid="machine-form-actions">
          <button type="submit" id="save-machine-button" data-testid="save-machine-button" class="btn-mgmt">Save Machine</button>
        </div>
      </form>
    </section>
 
    <section class="card" data-testid="machine-registry-card">
      <h2>Machine Registry</h2>
      <div id="machines-list-empty" data-testid="machines-list-empty-notice" class="notice">No machines registered yet.</div>
      <div id="machines-list" data-testid="machines-list"></div>
    </section>
  </main>