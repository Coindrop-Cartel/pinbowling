import { getScoringEngine } from '@core/engine.js';
import { ScoringFormats } from '@services/scoringFormat.js';
import { formatNumber, escapeHTML } from '@scripts/utils.js';
import { getPrintStylesheetLink } from './printStyles.js';

/**
 * Generates large printable signs showing target scores for each machine.
 * @param {Array<import('@scripts/types.js').Machine>} machines - The machines to print target scores for.
 * @param {string} [format=ScoringFormats.DEFAULT] - The scoring format ('bowling' or 'golf').
 * @returns {void}
 */
export function printMachineScores(machines, format = ScoringFormats.DEFAULT) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return alert('Please allow popups to print.');

  const maxOrder = machines.length > 0 ? Math.max(...machines.map(m => m.orderNumber)) : 0;
  const Engine = getScoringEngine(format);

  const pagesHtml = machines.map((m) => {
    const ranks = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    const scoresHtml = ranks.map((rank) => {
      const formatted = formatNumber(m.values[rank] || 0);
      let fontSize = (formatted.length > 9) ? '1.4rem' : (formatted.length > 7 ? '1.8rem' : '2.5rem');
      return `
        <div class="print-rank-card">
          <div class="print-rank-badge">${rank}</div>
          <div class="print-rank-value" style="font-size: ${fontSize};">${formatted}</div>
        </div>`;
    }).join('');

    let extraTargets = '';
    if (m.orderNumber === maxOrder) {
      const { t1, t2 } = Engine.getBonusTargets(m);
      extraTargets = `
        <div class="print-extra-targets">
          <div>Target 1: ${formatNumber(t1)}</div>
          <div>Target 2: ${formatNumber(t2)}</div>
        </div>`;
    }

    return `
      <div class="print-page">
        <div class="print-card">
          <div class="print-card-header">
            <h1 class="print-title">${escapeHTML(Engine.getRoundLabel())} ${m.orderNumber}</h1>
            <h2 class="print-title">${escapeHTML(m.machineName)}</h2>
          </div>
          <div class="print-grid">${scoresHtml}</div>
          ${extraTargets}
        </div>
      </div>`;
  }).join('');

  printWindow.document.write(`<html><head>${getPrintStylesheetLink()}</head><body class="print-window-body">${pagesHtml}</body></html>`);
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
}
