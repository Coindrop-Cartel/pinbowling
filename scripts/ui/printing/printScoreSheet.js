import { getScoringEngine } from '@core/engine.js';
import { ScoringFormats } from '@services/scoringFormat.js';
import { FormatBranding } from '@services/scoringFormatBranding.js';
import { formatNumber, escapeHTML, renderThresholdGrid } from '@scripts/utils.js';
import { formatPrintTargets, getPrintStylesheetLink } from './printStyles.js';

/**
 * Generates a printable blank score sheet for a league event.
 * @param {Array<import('@scripts/types.js').Machine>} machines - The machines to include on the score sheet.
 * @param {string} leagueName - The league name displayed in the header.
 * @param {string} eventName - The event name displayed in the header.
 * @param {string} [format=ScoringFormats.DEFAULT] - The scoring format ('bowling' or 'golf').
 * @param {boolean} [showThresholds=false] - Whether to render machine threshold grids.
 * @returns {void}
 */
export function printBlankScoreSheet(machines, leagueName, eventName, format = ScoringFormats.DEFAULT, showThresholds = false) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return alert('Please allow popups to print.');

  const Engine = getScoringEngine(format);
  const maxOrder = machines.length > 0 ? Math.max(...machines.map(m => m.orderNumber)) : 0;

  const instructions = `
    <p class="muted small threshold-row">${FormatBranding.get(format).scoringHint || 'Enter your score after each ball until you hit the target score, or run out of balls.'}</p>
  `;

  // Main header for the entire sheet
  const mainHeaderHtml = `
    <div class="print-meta">
      <div class="flex-between print-mb-4 align-center">
        ${leagueName ? `<div><strong>League:</strong> ${escapeHTML(leagueName)}</div>` : ''}
        <div><strong>Event:</strong> ${escapeHTML(eventName)}</div>
        <div><strong>Player:</strong> __________________________</div>
        <div><strong>Date:</strong> ________</div>
      </div>
      <div class="print-instructions">
        ${instructions}
      </div>
    </div>
  `;

  // Iterate through machines to create individual round sections
  const machineSectionsHtml = machines.map((m) => {
    const isLast = m.orderNumber === maxOrder;
    const lfHint = isLast ? FormatBranding.get(format).lastFrameHint : null;
    const targetSummary = formatPrintTargets(Engine.getPrintTargetSummaryData(m, isLast), formatNumber);

    const thresholdsSection = showThresholds && m.values ? `
      <div class="thresholds-section">
        ${renderThresholdGrid(Engine.filterThresholds(m.values), formatNumber, Engine, m.value1, m.value2)}
      </div>
    ` : '';

    return `
      <div class="print-block">
        <div class="print-block-header">
          <h3 class="print-mt-0">${escapeHTML(Engine.getRoundLabel())} ${m.orderNumber}: ${escapeHTML(m.machineName)}</h3>
          <div class="targets-summary">${targetSummary}</div>
        </div>
        ${thresholdsSection}
        ${lfHint ? `<div class="muted small print-hint-italic">${lfHint}</div>` : ''}
        <div class="flex gap-15">
          <div class="flex-1"><small>Ball 1</small><div class="score-line"></div></div>
          <div class="flex-1"><small>Ball 2</small><div class="score-line"></div></div>
          <div class="flex-1"><small>Ball 3</small><div class="score-line"></div></div>
          <div class="flex-1"><small>Score</small><div class="score-line"></div></div>
        </div>
      </div>`;
  }).join('');

  printWindow.document.write(`
    <html>
      <head>${getPrintStylesheetLink()}</head>
      <body class="print-window-body">
        ${mainHeaderHtml}
        ${machineSectionsHtml}
      </body>
    </html>`);
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
}

/**
 * Generates a printable score sheet pre-filled with player scores, followed by results on the next page.
 * @param {Array<import('@scripts/types.js').Machine>} machines - The machines to include.
 * @param {string} leagueName - The league name.
 * @param {string} eventName - The event name.
 * @param {string} [format=ScoringFormats.DEFAULT] - The scoring format ('bowling' or 'golf').
 * @param {Object} player - The player object.
 * @param {Object} scoreMap - Currently entered scores keyed by order number.
 * @param {string} resultsHtml - The HTML content of the results panel to display on page 2.
 * @returns {void}
 */
export function printScoreSheet(machines, leagueName, eventName, format = ScoringFormats.DEFAULT, player, scoreMap, resultsHtml) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return alert('Please allow popups to print.');

  const Engine = getScoringEngine(format);
  const maxOrder = machines.length > 0 ? Math.max(...machines.map(m => m.orderNumber)) : 0;

  const instructions = `
    <p class="muted small threshold-row">${FormatBranding.get(format).scoringHint || 'Enter your score after each ball until you hit the target score, or run out of balls.'}</p>
  `;

  // Main header for the first page
  const mainHeaderHtml = `
    <div class="print-meta">
      <div class="flex-between print-mb-4 align-center">
        ${leagueName ? `<div><strong>League:</strong> ${escapeHTML(leagueName)}</div>` : ''}
        <div><strong>Event:</strong> ${escapeHTML(eventName)}</div>
        <div><strong>Player:</strong> ${escapeHTML(player?.playerName || '__________________________')}</div>
        <div><strong>Date:</strong> ________</div>
      </div>
      <div class="print-instructions">
        ${instructions}
      </div>
    </div>
  `;

  // Compute per-round scores for the Score column
  const turnResults = Engine.calculateTurnResults(machines, scoreMap);

  // Iterate through machines to create individual round sections with scores
  const machineSectionsHtml = machines.map((m) => {
    const isLast = m.orderNumber === maxOrder;
    const lfHint = isLast ? FormatBranding.get(format).lastFrameHint : null;
    let targetsHtml = formatPrintTargets(Engine.getPrintTargetSummaryData(m, isLast), formatNumber);

    const playerScores = scoreMap?.[String(m.orderNumber)] || {};
    const ball1Val = (playerScores.ball1 !== undefined && playerScores.ball1 !== null && playerScores.ball1 !== '') ? formatNumber(playerScores.ball1) : '';
    const ball2Val = (playerScores.ball2 !== undefined && playerScores.ball2 !== null && playerScores.ball2 !== '') ? formatNumber(playerScores.ball2) : '';
    const ball3Val = (playerScores.ball3 !== undefined && playerScores.ball3 !== null && playerScores.ball3 !== '') ? formatNumber(playerScores.ball3) : '';

    const turnResult = turnResults.turnResults.find(t => t.orderNumber === m.orderNumber);
    const scoreVal = turnResult?.displayRunningTotal ?? '';

    return `
      <div class="print-block">
        <div class="print-block-header">
          <h3 class="print-mt-0">${escapeHTML(Engine.getRoundLabel())} ${m.orderNumber}: ${escapeHTML(m.machineName)}</h3>
          <div class="targets-summary">${targetsHtml}</div>
        </div>
        ${lfHint ? `<div class="muted small print-hint-italic">${lfHint}</div>` : ''}
        <div class="flex gap-15">
          <div class="flex-1"><small>Ball 1</small><div class="score-line filled-score">${ball1Val}</div></div>
          <div class="flex-1"><small>Ball 2</small><div class="score-line filled-score">${ball2Val}</div></div>
          <div class="flex-1"><small>Ball 3</small><div class="score-line filled-score">${ball3Val}</div></div>
          <div class="flex-1"><small>Score</small><div class="score-line filled-score">${scoreVal}</div></div>
        </div>
      </div>`;
  }).join('');

  // Combine page 1 and page 2 (Results)
  const fullHtml = `
    <div class="score-sheet-page">
      ${mainHeaderHtml}
      ${machineSectionsHtml}
    </div>
    <div class="page-break"></div>
    <div class="results-page">
      <div class="print-meta">
        <div class="flex-between print-mb-5">
          <div class="print-font-lg">
            ${leagueName ? `<div class="print-mb-4"><strong>League:</strong> ${escapeHTML(leagueName)}</div>` : ''}
            <div class="print-mb-4"><strong>Event:</strong> ${escapeHTML(eventName)}</div>
            <div class="print-mb-4"><strong>Results</strong></div>
          </div>
          <div class="text-right">
            <div><strong>Player:</strong> ${escapeHTML(player?.playerName || '')}</div>
          </div>
        </div>
      </div>
      <div class="results-content">
        ${resultsHtml || '<div class="muted">No results available.</div>'}
      </div>
    </div>
  `;

  printWindow.document.write(`
    <html>
      <head>${getPrintStylesheetLink()}</head>
      <body class="print-window-body">
        ${fullHtml}
      </body>
    </html>`);
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
}
