import { getScoringEngine } from './engine.js';

/**
 * Utility functions and state management helpers.
 */

/**
 * State helpers that prioritize URL parameters for sharing and consistency.
 */
export function getActiveLeagueId() {
  return new URLSearchParams(window.location.search).get('leagueId');
}

export function setActiveLeagueId(id) {
  const url = new URL(window.location);
  if (id) url.searchParams.set('leagueId', id);
  else url.searchParams.delete('leagueId');
  window.history.replaceState({}, '', url);
  initNavigation();
}

export function getActiveEventId() {
  return new URLSearchParams(window.location.search).get('eventId');
}

export function setActiveEventId(id) {
  const url = new URL(window.location);
  if (id) url.searchParams.set('eventId', id);
  else url.searchParams.delete('eventId');
  window.history.replaceState({}, '', url);
  initNavigation();
}

export function getCurrentPlayerId() {
  return new URLSearchParams(window.location.search).get('playerId');
}

export function setCurrentPlayerId(playerId) {
  const url = new URL(window.location);
  if (playerId) url.searchParams.set('playerId', playerId);
  else url.searchParams.delete('playerId');
  window.history.replaceState({}, '', url);
  initNavigation();
}


/**
 * Formats a number with locale-specific thousands separators.
 * @param {number} num 
 * @returns {string}
 */
export function formatNumber(num) {
  return Number(num).toLocaleString();
}

/**
 * Attaches real-time locale-aware number formatting to an input field.
 * Prevents non-numeric input and handles cursor positioning.
 * @param {HTMLInputElement} input 
 */
export function applyScoreFormatting(input) {
  if (!input) return;
  input.type = 'text';
  input.inputMode = 'numeric';
  input.addEventListener('input', (e) => {
    const cursor = e.target.selectionStart;
    const originalValue = e.target.value;
    let rawValue = originalValue.replace(/\D/g, '');
    
    if (rawValue === '') {
      e.target.value = '';
    } else {
      const formatted = Number(rawValue).toLocaleString();
      e.target.value = formatted;
      const diff = formatted.length - originalValue.length;
      e.target.setSelectionRange(cursor + diff, cursor + diff);
    }
  });
}

/**
 * Sets the 'active' class on the navigation item matching the current URL.
 */
export function initNavigation() {
  const currentPath = window.location.pathname.split('/').pop() || 'index.php';
  const urlParams = new URLSearchParams(window.location.search);

  document.querySelectorAll('.nav-item').forEach(link => {
    const href = link.getAttribute('href');
    if (href && !href.startsWith('http') && !href.startsWith('#')) {
      const [path, existingQuery] = href.split('?');
      const targetParams = new URLSearchParams(existingQuery);
      
      // Carry over global state params to navigation links
      ['leagueId', 'eventId', 'playerId'].forEach(key => {
        if (urlParams.has(key) && !targetParams.has(key)) {
          targetParams.set(key, urlParams.get(key));
        }
      });
      
      const newQuery = targetParams.toString();
      link.setAttribute('href', path + (newQuery ? '?' + newQuery : ''));
    }

    if (href === currentPath) {
      link.classList.add('active');
    }
  });
}

/**
 * Renders a preview of calculated pinball-to-pin mapping on the config page.
 * Also displays bonus targets for Frame 10.
 * @param {HTMLInputElement} score10Input 
 * @param {HTMLInputElement} score1Input 
 * @param {HTMLElement} previewValues 
 * @param {Object} Engine
 * @param {boolean} isLastRound
 */
export function renderPreview(score10Input, score1Input, previewValues, Engine, isLastRound = false) {
  const score10 = Number(score10Input.value.replace(/\D/g, ''));
  const score1 = Number(score1Input.value.replace(/\D/g, ''));
  const values = Engine.buildRoundValues(score10, score1);

  if (!values) {
    previewValues.innerHTML = "<div>Enter a 10 score or a 1 score to preview values for 9–2.</div>";
    return;
  }

  let html = Object.entries(values)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([rank, value]) => `<div><strong>${rank}:</strong> ${formatNumber(value)}</div>`)
    .join("");

  if (isLastRound && values[10]) {
    const { t1, t2 } = Engine.getBonusTargets({ values }); // Pass values in an object to match frame structure
    html += `<br><div><strong>Target 1:</strong> ${formatNumber(t1)}</div>`;
    html += `<div><strong>Target 2:</strong> ${formatNumber(t2)}</div>`;
  }

  previewValues.innerHTML = html;
}

/**
 * Generates large printable signs showing target scores for each machine.
 * @param {Array} machines 
 */
export function printMachineScores(machines) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return alert('Please allow popups to print.');

  const maxOrder = machines.length > 0 ? Math.max(...machines.map(m => m.order_number)) : 0;
  const Engine = getScoringEngine('bowling');

  const pagesHtml = machines.map((m) => {
    const ranks = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    const scoresHtml = ranks.map((rank) => {
      const formatted = formatNumber(m.values[rank] || 0);
      let fontSize = '2.5rem';
      if (formatted.length > 9) fontSize = '1.4rem';
      else if (formatted.length > 7) fontSize = '1.8rem';

      return `
        <div style="border: 3px solid #000; position: relative; height: 120px; display: flex; align-items: center; justify-content: center; background: #fff; overflow: hidden; box-sizing: border-box;">
          <div style="position: absolute; top: 0; right: 0; border-left: 3px solid #000; border-bottom: 3px solid #000; width: 35px; height: 35px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.2rem; background: #f0f0f0;">${rank}</div>
          <div style="font-size: ${fontSize}; font-weight: bold; text-align: center; width: 100%; white-space: nowrap;">${formatted}</div>
        </div>
      `;
    }).join('');

    let extraTargets = '';
    if (m.order_number === maxOrder) {
      const { t1, t2 } = Engine.getBonusTargets(m);
      extraTargets = `
        <div style="margin-top: 40px; display: flex; justify-content: space-around; width: 100%; font-size: 2.2rem; font-weight: bold; border-top: 4px dashed #000; padding-top: 20px;">
          <div>Target 1: ${formatNumber(t1)}</div>
          <div>Target 2: ${formatNumber(t2)}</div>
        </div>`;
    }

    return `
      <div class="page" style="height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; page-break-after: always; padding: 40px; box-sizing: border-box;">
        <div style="border: 6px solid #000; padding: 50px; width: 100%; max-width: 1100px;">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 40px; border-bottom: 6px solid #000; padding-bottom: 15px;">
            <h1 style="margin: 0; font-size: 4rem;">Round ${m.order_number}</h1>
            <h2 style="margin: 0; font-size: 4rem;">${m.machine_name}</h2>
          </div>
          <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 20px;">${scoresHtml}</div>
          ${extraTargets}
        </div>
      </div>`;
  }).join('');

  printWindow.document.write(`<html><body style="margin:0;">${pagesHtml}</body></html>`);
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
}

/**
 * Generates a printable PDF-like score sheet for manual tracking.
 * @param {Array} machines 
 */
export function printBlankScoreSheet(machines) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return alert('Please allow popups to print.');

  const framesHtml = machines.map((m) => `
    <div style="border: 2px solid #000; margin-bottom: 8px; padding: 8px 12px; page-break-inside: avoid;">
      <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 6px;">
        <span style="font-weight: bold;">Round ${m.order_number}</span>
        <span>Game: <strong>${m.machine_name}</strong></span>
        <span>Target: <strong>${formatNumber(m.values[10])}</strong></span>
      </div>
      <div style="display: flex; gap: 20px;">
        <div style="flex: 1;"><small>Ball 1</small><div style="border-bottom: 1px solid #000; height: 20px;"></div></div>
        <div style="flex: 1;"><small>Ball 2</small><div style="border-bottom: 1px solid #000; height: 20px;"></div></div>
        <div style="flex: 1;"><small>Ball 3</small><div style="border-bottom: 1px solid #000; height: 20px;"></div></div>
      </div>
    </div>`).join('');

  printWindow.document.write(`
    <html>
      <head><style>body { font-family: sans-serif; padding: 20px; }</style></head>
      <body>
        <div style="border-bottom: 2px solid #000; margin-bottom: 12px; padding-bottom: 6px;">
          <h1>PinBowling Score Sheet</h1>
          <p>Player: __________________________ &nbsp;&nbsp; Date: ________</p>
        </div>
        ${framesHtml}
      </body>
    </html>`);
  printWindow.document.close();
  setTimeout(() => { 
    printWindow.print(); 
    printWindow.close(); 
  }, 250);
}