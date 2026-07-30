<?php $pageTitle = 'Leagues & Events'; ?>
  <main class="page-container">
    <header>
      <h1>Leagues & Events Management</h1>
    </header>
 
    <section class="card" data-testid="league-form-card">
      <form id="league-form" autocomplete="off" data-testid="league-form">
        <div class="form-row">
          <label for="league-name">League Name</label>
          <input id="league-name" data-testid="league-name-input" type="text" placeholder="e.g., Summer 2024 League" required />
          <button id="create-league-toggle" data-testid="create-league-toggle" type="button" class="secondary btn-mgmt mt-10">Create League</button>
        </div>
        <div id="league-date-row" data-testid="league-date-row" class="form-row hidden">
          <label for="league-start-date">Start Date</label>
          <input id="league-start-date" data-testid="league-start-date-input" type="date" required />
        </div>
        <div id="league-competition-row" data-testid="league-competition-row" class="form-row hidden">
          <label for="league-competition">Competition Format</label>
          <select id="league-competition" data-testid="league-competition-select">
            <option value="group" selected>Group Play</option>
            <option value="head2head">Head to Head</option>
          </select>
        </div>
        <div id="league-participants-row" data-testid="league-participants-row" class="form-row hidden">
          <label for="league-participants">Player Assignment</label>
          <select id="league-participants" data-testid="league-participants-select">
            <option value="individual" selected>Individual</option>
            <option value="team">Team</option>
          </select>
        </div>
        <div id="league-format-row" data-testid="league-format-row" class="form-row hidden">
          <label for="league-scoring-format">Default Scoring Format</label>
          <select id="league-scoring-format" data-testid="league-scoring-format-select"></select>
        </div>
        <div id="league-season-scoring-row" data-testid="league-season-scoring-row" class="form-row hidden">
          <label for="league-season-scoring">Season Scoring</label>
          <select id="league-season-scoring" data-testid="league-season-scoring-select"></select>
        </div>
        <div id="league-weekly-points-row" data-testid="league-weekly-points-row" class="form-row hidden">
          <label for="league-weekly-points">Weekly Points (Optional)</label>
          <input id="league-weekly-points" data-testid="league-weekly-points-input" type="number" min="0" placeholder="Defaults to Player Count" />
        </div>
        <div id="league-point-spread-row" data-testid="league-point-spread-row" class="form-row hidden">
          <label for="league-point-spread">Point Spread (Optional)</label>
          <input id="league-point-spread" data-testid="league-point-spread-input" type="number" min="1" placeholder="Defaults to 1" />
        </div>
        <div id="league-drop-weeks-row" data-testid="league-drop-weeks-row" class="form-row hidden">
          <label for="league-drop-weeks">Drop Lowest Weeks</label>
          <input id="league-drop-weeks" data-testid="league-drop-weeks-input" type="number" min="0" value="0" />
        </div>
        <div id="league-weeks-in-season-row" data-testid="league-weeks-in-season-row" class="form-row hidden">
          <label for="league-weeks-in-season">Weeks in Season</label>
          <input id="league-weeks-in-season" data-testid="league-weeks-in-season-input" type="number" min="1" value="8" />
        </div>
        <div id="league-rounds-per-game-row" data-testid="league-rounds-per-game-row" class="form-row hidden">
          <label id="league-rounds-per-game-label" for="league-rounds-per-game">Rounds per Game</label>
          <select id="league-rounds-per-game" data-testid="league-rounds-per-game-select">
            <option value="2" selected>2 Rounds</option>
            <option value="4">4 Rounds</option>
            <option value="6">6 Rounds</option>
            <option value="9">9 Rounds</option>
          </select>
        </div>
        <div id="league-locations-row" data-testid="league-locations-row" class="form-row hidden">
          <div style="display: flex; align-items: center; gap: 12px;">
            <label style="margin: 0; white-space: nowrap;">Assigned Locations</label>
            <button type="button" id="league-locations-btn" data-testid="league-locations-btn" class="btn-secondary btn-mgmt">Select Locations</button>
          </div>
          <div id="league-locations-container" data-testid="league-locations-container" style="border: 1px solid #ddd; border-radius: 4px; padding: 8px 12px; min-height: 36px;">
            <span id="league-locations-summary" data-testid="league-locations-summary" style="color: #666;"></span>
          </div>
        </div>
        <div class="form-actions hidden" data-testid="league-form-actions">
          <button type="submit" id="create-league-btn" data-testid="create-league-button" class="btn-mgmt" disabled>Create League</button>
        </div>
      </form>
    </section>
 
    <section class="card" data-testid="leagues-list-card">
      <div class="leagues-header-row">
        <h2 style="margin:0;">Leagues</h2>
        <label id="show-archived-label" class="leagues-archived-toggle">
          <input type="checkbox" id="show-archived-leagues">Show Archived
        </label>
      </div>
      <div id="leagues-list-empty" data-testid="leagues-list-empty-notice" class="notice">No leagues created yet.</div>
      <div id="leagues-list" data-testid="leagues-list">
        <!-- Leagues will be rendered here -->
      </div>
    </section>
 
    <!-- Event Form (hidden by default, shown when adding/editing an event) -->
    <section id="event-form-card" data-testid="event-form-card" class="card hidden">
      <h2 id="event-form-title" data-testid="event-form-title">Add Event to League: <span id="event-form-league-name" data-testid="event-form-league-name"></span></h2>
      <form id="event-form" data-testid="event-form">
        <input type="hidden" id="event-league-id" data-testid="event-league-id-input" />
        <input type="hidden" id="event-id" data-testid="event-id-input" />
        <div class="form-row">
          <label for="event-name">Event Name</label>
          <input id="event-name" data-testid="event-name-input" type="text" placeholder="e.g., Week 1" required />
        </div>
        <div class="form-row">
          <label for="event-date">Event Date</label>
          <input id="event-date" data-testid="event-date-input" type="date" />
        </div>
        <div class="form-row">
          <label for="event-location">Location</label>
          <select id="event-location" data-testid="event-location-select">
            <option value="">Select Location (Optional)</option>
            <!-- Locations will be loaded here -->
          </select>
        </div>
        <div class="form-row">
          <label for="event-scoring-format">Scoring Format</label>
          <select id="event-scoring-format" data-testid="event-scoring-format-select"></select>
        </div>
        <div class="form-actions" data-testid="event-form-actions">
          <button type="submit" id="save-event-btn" data-testid="save-event-button" class="btn-mgmt">Save Event</button>
          <button type="button" id="cancel-event-edit" data-testid="cancel-event-edit-button" class="secondary btn-mgmt">Cancel</button>
        </div>
      </form>
    </section>
  </main>
