<?php $pageTitle = 'Manage Machines'; ?>
  <main class="page-container">
    <header>
      <h1>Manage Machines</h1>
    </header>

    <section class="card">
      <form id="machine-form" autocomplete="off">
        <div class="form-row">
          <label for="machine-name">Machine Name</label>
          <input id="machine-name" type="text" placeholder="Filter registry or enter new name..." required />
        </div>
        <div class="form-actions">
          <button type="submit" id="add-machine-btn" disabled>Add Machine</button>
        </div>
      </form>
    </section>

    <section class="card">
      <h2>Machine Registry</h2>
      <div id="machines-list-empty" class="notice">No machines registered yet.</div>
      <div id="machines-list"></div>
    </section>
  </main>