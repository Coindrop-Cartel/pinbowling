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
    <header>
      <h1>Manage Locations</h1>
    </header>

    <section class="card">
      <form id="location-form" autocomplete="off">
        <input type="hidden" id="editing-location-id" value="" />
        <div class="form-row">
          <label for="location-name">Location Name</label>
          <input id="location-name" type="text" placeholder="e.g. The Silver Ballroom" required />
        </div>
        <div id="location-city-state-row" class="form-row hidden" style="display: flex; gap: 15px; margin-bottom: 15px;">
          <div class="form-row" style="flex: 2; margin-bottom: 0;">
            <label for="location-city">City</label>
            <input id="location-city" type="text" placeholder="e.g. St. Louis" />
          </div>
          <div class="form-row" style="flex: 1; margin-bottom: 0;">
            <label for="location-state">State</label>
            <select id="location-state" style="width: 100%; box-sizing: border-box;">
              <option value="">Select State</option>
              <option value="AL">AL</option><option value="AK">AK</option><option value="AZ">AZ</option>
              <option value="AR">AR</option><option value="CA">CA</option><option value="CO">CO</option>
              <option value="CT">CT</option><option value="DE">DE</option><option value="FL">FL</option>
              <option value="GA">GA</option><option value="HI">HI</option><option value="ID">ID</option>
              <option value="IL">IL</option><option value="IN">IN</option><option value="IA">IA</option>
              <option value="KS">KS</option><option value="KY">KY</option><option value="LA">LA</option>
              <option value="ME">ME</option><option value="MD">MD</option><option value="MA">MA</option>
              <option value="MI">MI</option><option value="MN">MN</option><option value="MS">MS</option>
              <option value="MO">MO</option><option value="MT">MT</option><option value="NE">NE</option>
              <option value="NV">NV</option><option value="NH">NH</option><option value="NJ">NJ</option>
              <option value="NM">NM</option><option value="NY">NY</option><option value="NC">NC</option>
              <option value="ND">ND</option><option value="OH">OH</option><option value="OK">OK</option>
              <option value="OR">OR</option><option value="PA">PA</option><option value="RI">RI</option>
              <option value="SC">SC</option><option value="SD">SD</option><option value="TN">TN</option>
              <option value="TX">TX</option><option value="UT">UT</option><option value="VT">VT</option>
              <option value="VA">VA</option><option value="WA">WA</option><option value="WV">WV</option>
              <option value="WI">WI</option><option value="WY">WY</option>
            </select>
          </div>
        </div>
        <div class="form-actions hidden">
          <button type="submit" id="save-location-button" class="btn-mgmt">Add Location</button>
          <button type="button" id="cancel-loc-edit-button" class="secondary btn-mgmt hidden">Cancel Edit</button>
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