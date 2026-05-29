/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach } from 'vitest';

/**
 * Setup minimum browser environment properties required for evaluation.
 * JSDOM provides most of this, but we need to stub properties that api.js expects.
 */
vi.hoisted(() => {
  vi.stubGlobal('location', {
    origin: 'http://localhost',
    pathname: '/index.php'
  });
  window.PB_API_SECRET = '';
  
  // Mock fetch because api.js logic depends on it
  global.fetch = vi.fn(); 
});

import { createSearchableSelect } from '../scripts/uiComponents.js';

/**
 * Tests for reusable UI components.
 * Focuses on the searchable select logic which is core to player and machine selection.
 */
describe('UI Components (uiComponents.js)', () => {
  let searchInput, selectElement;

  beforeEach(() => {
    // Create a minimal DOM environment
    document.body.innerHTML = `
      <input id="search-input" />
      <select id="select-element"></select>
    `;
    searchInput = document.getElementById('search-input');
    selectElement = document.getElementById('select-element');
  });

  it('createSearchableSelect filters options correctly', () => {
    const data = [
      { id: 101, title: 'Addams Family' },
      { id: 102, title: 'Attack from Mars' },
      { id: 103, title: 'Twilight Zone' }
    ];

    const { updateOptions } = createSearchableSelect(searchInput, selectElement, data, {
      valueKey: 'id',
      labelKey: 'title',
      placeholder: 'Select Machine'
    });

    // Test Initial State
    updateOptions('');
    expect(selectElement.options.length).toBe(4); // 1 placeholder + 3 items

    // Test Filtering
    updateOptions('Mars');
    expect(selectElement.options.length).toBe(2); // 1 placeholder + 1 match
    expect(selectElement.options[1].textContent).toBe('Attack from Mars');
    expect(selectElement.options[1].value).toBe('102');
  });

  it('createSearchableSelect syncs select value when exact match is found in input', () => {
    const data = [
      { id: 5, name: 'Player One' },
      { id: 6, name: 'Player Two' }
    ];

    createSearchableSelect(searchInput, selectElement, data, {
      valueKey: 'id',
      labelKey: 'name'
    });

    // Simulate user typing exactly "Player Two"
    searchInput.value = 'Player Two';
    searchInput.dispatchEvent(new Event('input'));

    expect(selectElement.value).toBe('6');
  });

  it('updateOptions handles empty data gracefully', () => {
    const { updateOptions } = createSearchableSelect(searchInput, selectElement, [], {
      placeholder: 'None'
    });
    
    updateOptions('Anything');
    expect(selectElement.options.length).toBe(1);
    expect(selectElement.options[0].textContent).toBe('None');
  });
});