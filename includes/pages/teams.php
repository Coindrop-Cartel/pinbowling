<?php $pageTitle = 'Teams'; ?>
<main class="page-container">
  <header>
    <h1>Team Management</h1>
  </header>
 
  <section class="card" id="team-form-card" data-testid="team-form-card">
    <h2 id="team-form-title" data-testid="team-form-title">Add New Team</h2>
    <form id="team-form" data-testid="team-form">
      <input type="hidden" id="team-id" data-testid="team-id-input" />
      <div class="form-row">
        <label for="team-name">Team Name</label>
        <input id="team-name" data-testid="team-name-input" type="text" placeholder="e.g., The Silverballs" required />
      </div>
      <div class="flex gap-20">
        <div class="form-row flex-1">
          <label for="team-city">City</label>
          <input id="team-city" data-testid="team-city-input" type="text" placeholder="e.g., Chicago" />
        </div>
        <div class="form-row flex-1">
          <label for="team-state">State</label>
          <input id="team-state" data-testid="team-state-input" type="text" placeholder="e.g., IL" />
        </div>
      </div>
      <div class="form-actions" data-testid="team-form-actions">
        <button type="submit" id="save-team-btn" data-testid="save-team-button" class="btn-mgmt">Save Team</button>
        <button type="button" id="cancel-team-btn" data-testid="cancel-team-button" class="secondary btn-mgmt hidden">Cancel</button>
      </div>
    </form>
  </section>

  <section class="card">
    <h2>Teams Registry</h2>
    <div id="teams-list-empty" class="notice">No teams registered yet.</div>
    <div id="teams-list" data-testid="teams-list"></div>
  </section>
</main>