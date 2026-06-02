<?php
/**
 * Management interface for physical pinball venues.
 * 
 * This page provides UI for:
 * 1. Registering and editing Locations (Venues) where events take place.
 * 2. Mapping global Machines to specific Locations.
 * 3. Defining "baseline" target scores for machines at a venue to simplify event setup.
 */
$pageTitle = 'Manage Locations';
?>
  <main class="page-container">
    <header style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h1>Manage Locations</h1>
    </header>

    <section class="card">
      <form id="location-form" autocomplete="off">
        <input type="hidden" id="editing-location-id" value="" />
        <div class="form-row">
          <label for="location-name">Location Name</label>
          <input id="location-name" type="text" placeholder="e.g. The Silver Ballroom" required />
        </div>
        <div class="form-row">
          <label for="location-city">City</label>
          <input id="location-city" type="text" placeholder="e.g. St. Louis" />
        </div>
        <div class="form-row">
          <label for="location-state">State</label>
          <input id="location-state" type="text" placeholder="e.g. MO" />
        </div>
        <div class="form-actions">
          <button type="submit" id="save-location-button">Add Location</button>
          <button type="button" id="cancel-loc-edit-button" class="secondary hidden">Cancel Edit</button>
        </div>
      </form>
    </section>

    <section class="card">
      <h2>Registered Venues</h2>
      <div id="locations-list-empty" class="notice">No locations registered yet.</div>
      <div id="locations-list"></div>
    </section>

    <!-- Dynamic form for adding machines to a location -->
    <section id="location-machine-form-card" class="card hidden"></section>
  </main>