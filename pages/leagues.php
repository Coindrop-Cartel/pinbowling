<?php $pageTitle = 'Leagues & Events'; ?>
  <main class="page-container">
    <header>
      <h1>Leagues & Events Management</h1>
    </header>

    <section class="card">
      <form id="league-form" autocomplete="off">
        <div class="form-row">
          <label for="league-name">League Name</label>
          <input id="league-name" type="text" placeholder="e.g., Summer 2024 League" required style="width: 100%; box-sizing: border-box;" />
        </div>
        <div id="league-date-row" class="form-row hidden">
          <label for="league-start-date">Start Date</label>
          <input id="league-start-date" type="date" required style="width: 100%; box-sizing: border-box;" />
        </div>
        <div id="league-participants-row" class="form-row hidden">
          <label for="league-participants">League Type</label>
          <select id="league-participants" style="width: 100%; box-sizing: border-box;">
            <option value="individual" selected>Individual</option>
            <option value="team">Team</option>
          </select>
        </div>
        <div id="league-format-row" class="form-row hidden">
          <label for="league-scoring-format">Default Scoring Format</label>
          <select id="league-scoring-format" style="width: 100%; box-sizing: border-box;"></select>
        </div>
        <div id="league-season-scoring-row" class="form-row hidden">
          <label for="league-season-scoring">Season Scoring</label>
          <select id="league-season-scoring" style="width: 100%; box-sizing: border-box;"></select>
        </div>
        <div id="league-drop-weeks-row" class="form-row hidden">
          <label for="league-drop-weeks">Drop Lowest Weeks</label>
          <input id="league-drop-weeks" type="number" min="0" value="0" style="width: 100%; box-sizing: border-box;" />
        </div>
        <div class="form-actions hidden">
          <button type="submit" id="create-league-btn" class="btn-mgmt" disabled>Create League</button>
        </div>
      </form>
    </section>

    <section class="card">
      <h2>Leagues</h2>
      <div id="leagues-list-empty" class="notice">No leagues created yet.</div>
      <div id="leagues-list">
        <!-- Leagues will be rendered here -->
      </div>
    </section>

    <!-- Event Form (hidden by default, shown when adding/editing an event) -->
    <section id="event-form-card" class="card hidden">
      <h2 id="event-form-title">Add Event to League: <span id="event-form-league-name"></span></h2>
      <form id="event-form">
        <input type="hidden" id="event-league-id" />
        <input type="hidden" id="event-id" />
        <div class="form-row">
          <label for="event-name">Event Name</label>
          <input id="event-name" type="text" placeholder="e.g., Week 1" required style="width: 100%; box-sizing: border-box;" />
        </div>
        <div class="form-row">
          <label for="event-date">Event Date</label>
          <input id="event-date" type="date" style="width: 100%; box-sizing: border-box;" />
        </div>
        <div class="form-row">
          <label for="event-location">Location</label>
          <select id="event-location" style="width: 100%; box-sizing: border-box;">
            <option value="">Select Location (Optional)</option>
            <!-- Locations will be loaded here -->
          </select>
        </div>
        <div class="form-row">
          <label for="event-scoring-format">Scoring Format</label>
          <select id="event-scoring-format" style="width: 100%; box-sizing: border-box;"></select>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn-mgmt">Save Event</button>
          <button type="button" id="cancel-event-edit" class="secondary btn-mgmt">Cancel</button>
        </div>
      </form>
    </section>
  </main>