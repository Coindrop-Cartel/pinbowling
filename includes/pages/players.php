<?php $pageTitle = 'Manage Players'; ?>
  <main class="page-container">
    <header>
      <h1>Manage Players</h1>
    </header>
 
    <section class="card" data-testid="player-form-card">
      <h2 id="player-form-title" data-testid="player-form-title">Add New Player</h2>
      <form id="player-form" data-testid="player-form" autocomplete="off">
        <input type="hidden" id="editing-player-id" data-testid="editing-player-id-input" value="" />
        <div class="form-row">
          <label for="player-name">Player Name</label>
          <input id="player-name" data-testid="player-name-input" type="text" placeholder="Enter player name" required />
        </div>
        <div id="player-username-row" data-testid="player-username-row" class="form-row hidden">
          <label for="player-username">Username</label>
          <input id="player-username" data-testid="player-username-input" type="text" placeholder="Enter username" />
        </div>
        <div id="player-email-row" data-testid="player-email-row" class="form-row hidden">
          <label for="player-email">Email Address</label>
          <input id="player-email" data-testid="player-email-input" type="email" placeholder="Enter email address" />
        </div>
        <div id="player-ifpa-row" data-testid="player-ifpa-row" class="form-row hidden">
          <label for="ifpa-id">IFPA ID (Optional)</label>
          <input id="ifpa-id" data-testid="ifpa-id-input" type="text" placeholder="e.g., 12345" />
        </div>
        <div id="player-matchplay-row" data-testid="player-matchplay-row" class="form-row hidden">
          <label for="matchplay-id">Matchplay ID (Optional)</label>
          <input id="matchplay-id" data-testid="matchplay-id-input" type="text" placeholder="e.g., 67890" />
        </div>
        <div id="player-format-row" data-testid="player-format-row" class="form-row hidden">
          <label for="player-scoring-format">Preferred Scoring Format</label>
          <select id="player-scoring-format" data-testid="player-scoring-format-select"></select>
        </div>
        <div id="player-form-actions" data-testid="player-form-actions" class="form-actions hidden">
          <button type="submit" id="save-player-button" data-testid="save-player-button">Save Player</button>
          <button type="button" id="cancel-edit-button" data-testid="cancel-edit-button" class="secondary hidden">Cancel Edit</button>
        </div>
      </form>
    </section>
 
    <section class="card" data-testid="player-list-card">
      <h2>Players</h2>
      <div id="player-list-container" data-testid="player-list-container">
        <ul id="player-list" data-testid="player-list" class="notice player-list">
          <li>Loading players...</li>
        </ul>
      </div>
    </section>
  </main>
