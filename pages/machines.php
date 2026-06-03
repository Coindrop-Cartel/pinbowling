<?php $pageTitle = 'Manage Machines'; ?>
  <main class="page-container">
    <header>
      <h1>Manage Machines</h1>
    </header>

    <section class="card">
      <h2 id="machine-form-title">Add New Machine</h2>
      <form id="machine-form" autocomplete="off">
        <input type="hidden" id="editing-machine-id" value="" />
        <div class="form-row">
          <label for="machine-name">Machine Name</label>
          <input id="machine-name" type="text" placeholder="Enter machine name" required />
        </div>
        <div id="machine-metadata-row" class="form-row hidden" style="display: grid; grid-template-columns: 1fr 2fr; gap: 15px;">
          <div class="form-row">
            <label for="machine-year">Year</label>
            <input id="machine-year" type="number" placeholder="e.g. 1992" />
          </div>
          <div class="form-row">
            <label for="machine-manufacturer">Manufacturer</label>
            <input id="machine-manufacturer" type="text" placeholder="e.g. Williams" />
          </div>
        </div>
        <div class="form-actions hidden">
          <button type="submit" id="save-machine-button">Save Machine</button>
        </div>
      </form>
    </section>

    <section class="card">
      <h2>Machine Registry</h2>
      <div id="machines-list-empty" class="notice">No machines registered yet.</div>
      <div id="machines-list"></div>
    </section>
  </main>