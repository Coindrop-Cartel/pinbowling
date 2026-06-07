<?php $pageTitle = 'Teams'; ?>
<main class="page-container">
  <header>
    <h1>Team Management</h1>
  </header>

  <section class="card" id="team-form-card">
    <h2 id="team-form-title">Add New Team</h2>
    <form id="team-form">
      <input type="hidden" id="team-id" />
      <div class="form-row">
        <label for="team-name">Team Name</label>
        <input id="team-name" type="text" placeholder="e.g., The Silverballs" required />
      </div>
      <div style="display: flex; gap: 20px;">
        <div class="form-row" style="flex: 1;">
          <label for="team-city">City</label>
          <input id="team-city" type="text" placeholder="e.g., Chicago" />
        </div>
        <div class="form-row" style="flex: 1;">
          <label for="team-state">State</label>
          <input id="team-state" type="text" placeholder="e.g., IL" />
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" id="save-team-btn" class="btn-mgmt">Save Team</button>
        <button type="button" id="cancel-team-btn" class="secondary btn-mgmt hidden">Cancel</button>
      </div>
    </form>
  </section>

  <section class="card">
    <h2>Teams Registry</h2>
    <div id="teams-list-empty" class="notice">No teams registered yet.</div>
    <div id="teams-list"></div>
  </section>
</main>