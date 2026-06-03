<?php $pageTitle = 'Manage Players'; ?>
  <main class="page-container">
    <header>
      <h1>Manage Players</h1>
    </header>

    <section class="card">
      <h2 id="player-form-title">Add New Player</h2>
      <form id="player-form" autocomplete="off">
        <input type="hidden" id="editing-player-id" value="" />
        <div class="form-row">
          <label for="player-name">Player Name</label>
          <input id="player-name" type="text" placeholder="Enter player name" required />
        </div>
        <div id="player-ifpa-row" class="form-row hidden">
          <label for="ifpa-id">IFPA ID (Optional)</label>
          <input id="ifpa-id" type="text" placeholder="e.g., 12345" />
        </div>
        <div id="player-matchplay-row" class="form-row hidden">
          <label for="matchplay-id">Matchplay ID (Optional)</label>
          <input id="matchplay-id" type="text" placeholder="e.g., 67890" />
        </div>
        <div id="player-form-actions" class="form-actions hidden">
          <button type="submit" id="save-player-button">Save Player</button>
          <button type="button" id="cancel-edit-button" class="secondary hidden">Cancel Edit</button>
        </div>
      </form>
    </section>

    <section class="card">
      <h2>Players</h2>
      <div id="player-list-container">
        <ul id="player-list" class="notice" style="list-style: none; padding: 14px 16px; margin: 0;">
          <li>Loading players...</li>
        </ul>
      </div>
    </section>
  </main>
