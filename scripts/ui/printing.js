import { getScoringEngine } from '@core/engine.js';
import { formatNumber } from '@scripts/utils.js';

/**
 * Generates large printable signs showing target scores for each machine.
 */
export function printMachineScores(machines, format = 'bowling') {
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
        <div class="print-frame">
          <div class="print-frame-header">
            <h1 class="print-title">${Engine.getRoundLabel()} ${m.orderNumber}</h1>
            <h2 class="print-title">${m.machineName}</h2>
          </div>
          <div class="print-grid">${scoresHtml}</div>
          ${extraTargets}
        </div>
      </div>`;
  }).join('');

  const printCss = `
    body { margin: 0; font-family: sans-serif; }
    .print-page { height:100vh; }
    .print-frame { box-sizing: border-box; }
  `;

  printWindow.document.write(`<html><head><style>${printCss}</style></head><body>${pagesHtml}</body></html>`);
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
}

/**
 * Generates a printable PDF-like score sheet for manual tracking.
 */
export function printBlankScoreSheet(machines, leagueName, eventName, format = 'bowling') {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return alert('Please allow popups to print.');

  const Engine = getScoringEngine(format);
  const isBowling = format === 'bowling';
  const maxOrder = machines.length > 0 ? Math.max(...machines.map(m => m.orderNumber)) : 0;

  const instructions = `
    <p class="muted small" style="margin:2px 0;">${Engine.getScoringHint() || 'Enter your score after each ball until you hit the target score, or run out of balls.'}</p>
  `;

  // This is the main header for the entire sheet
  const mainHeaderHtml = `
    <div class="print-meta">
      <div class="flex-between" style="margin-bottom:5px;">
        <div style="font-size:1.2rem;">
          ${leagueName ? `<div style="margin-bottom:4px;"><strong>League:</strong> ${leagueName}</div>` : ''}
          <div style="margin-bottom:4px;"><strong>Event:</strong> ${eventName}</div>
        </div>
        <div style="text-align:right;">
          <div>Player: __________________________</div>
          <div>Date: ________</div>
        </div>
      </div>
      <div style="font-size:0.9rem; line-height:1.4;">
        ${instructions}
      </div>
    </div>
  `;

  // Now, iterate through machines to create individual frame/hole sections
  const machineSectionsHtml = machines.map((m) => {
    const isLast = m.orderNumber === maxOrder;
    const lfHint = isLast ? Engine.getLastFrameHint() : null;
    let targetsHtml = '';
    if (isBowling) { // Bowling format
      targetsHtml = `<span>Strike: <strong>${formatNumber(m.values[10])}</strong></span>`;
      if (isLast) { // Only for the last frame
        const { t1, t2 } = Engine.getBonusTargets(m);
        targetsHtml += `
          <span style="margin-left: 15px;">Target 1: <strong>${formatNumber(t1)}</strong></span>
          <span style="margin-left: 15px;">Target 2: <strong>${formatNumber(t2)}</strong></span>
        `;
      }
    } else { // Golf format
      targetsHtml = `
        <span>Target Score: <strong>${formatNumber(m.values[m.value2] || m.value1)}</strong></span>
        <span style="margin-left: 15px;">Par: <strong>${m.value2}</strong></span>
      `;
    }

    return `
      <div class="print-block">
        <div class="print-block-header">
          <h3 style="margin: 0;">${Engine.getRoundLabel()} ${m.orderNumber}: ${m.machineName}</h3>
          <div class="targets-summary">${targetsHtml}</div>
        </div>
        ${lfHint ? `<div class="muted small" style="margin-bottom:4px;font-style:italic;">${lfHint}</div>` : ''}
        <div class="flex" style="gap:15px;">
          <div class="flex-1"><small>Ball 1</small><div class="score-line"></div></div>
          <div class="flex-1"><small>Ball 2</small><div class="score-line"></div></div>
          <div class="flex-1"><small>Ball 3</small><div class="score-line"></div></div>
        </div>
      </div>`;
  }).join('');

  const sheetCss = `
    body { font-family: sans-serif; padding: 10px 20px; line-height: 1.1; font-size: 13px; }
    .print-meta { border-bottom: 2px solid #000; margin-bottom: 10px; padding-bottom: 5px; }
    .print-block { border: 1px solid #ccc; padding: 8px 12px; margin-bottom: 6px; border-radius: 4px; page-break-inside: avoid; }
    .print-block-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; padding-bottom: 5px; border-bottom: 1px dashed #eee; }
    .targets-summary span { font-size: 0.85rem; }
    .flex { display: flex; }
    .flex-1 { flex: 1; }
    .score-line { border-bottom: 1.5pt solid #000; height: 1.5em; margin-top: 2px; }
    .flex-between { display: flex; justify-content: space-between; }
    .muted { opacity: 0.7; }
    .small { font-size: 0.75rem; }
    h3 { font-size: 1rem; margin: 0; }
  `;

  printWindow.document.write(`
    <html>
      <head><style>${sheetCss}</style></head>
      <body>
        ${mainHeaderHtml}
        ${machineSectionsHtml}
      </body>
    </html>`);
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
}