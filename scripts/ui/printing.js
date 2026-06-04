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
        <div style="border: 3px solid #000; position: relative; height: 120px; display: flex; align-items: center; justify-content: center; background: #fff; overflow: hidden; box-sizing: border-box;">
          <div style="position: absolute; top: 0; right: 0; border-left: 3px solid #000; border-bottom: 3px solid #000; width: 35px; height: 35px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.2rem; background: #f0f0f0;">${rank}</div>
          <div style="font-size: ${fontSize}; font-weight: bold; text-align: center; width: 100%; white-space: nowrap;">${formatted}</div>
        </div>`;
    }).join('');

    let extraTargets = '';
    if (m.orderNumber === maxOrder) {
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
            <h1 style="margin: 0; font-size: 4rem;">${Engine.getRoundLabel()} ${m.orderNumber}</h1>
            <h2 style="margin: 0; font-size: 4rem;">${m.machineName}</h2>
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
 */
export function printBlankScoreSheet(machines, leagueName, eventName, format = 'bowling') {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return alert('Please allow popups to print.');

  const Engine = getScoringEngine(format);
  const isBowling = format === 'bowling';
  const maxOrder = machines.length > 0 ? Math.max(...machines.map(m => m.orderNumber)) : 0;

  const instructions = `
    <p style="margin: 5px 0;"><strong>Do NOT Play Extra balls.</strong></p>
    <p style="margin: 5px 0;">Enter your score after each ball until you hit the target score, or run out of balls.
    ${isBowling ? ' Except on the last frame where you should keep playing until you hit the Target 2 score or run out of balls.' : ''}</p>
  `;

  const framesHtml = machines.map((m) => {
    const isLast = m.orderNumber === maxOrder;
    let targetsHtml = '';
    if (isBowling) {
      targetsHtml = `<span>Strike: <strong>${formatNumber(m.values[10])}</strong></span>`;
      if (isLast) {
        const { t1, t2 } = Engine.getBonusTargets(m);
        targetsHtml += `
          <span style="margin-left: 15px;">Target 1: <strong>${formatNumber(t1)}</strong></span>
          <span style="margin-left: 15px;">Target 2: <strong>${formatNumber(t2)}</strong></span>
        `;
      }
    } else {
      // Golf
      targetsHtml = `
        <span>Target Score: <strong>${formatNumber(m.values[m.value2] || m.value1)}</strong></span>
        <span style="margin-left: 15px;">Par: <strong>${m.value2}</strong></span>
      `;
    }

    return `
    <div style="border: 2px solid #000; margin-bottom: 8px; padding: 8px 12px; page-break-inside: avoid;">
      <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 6px;">
        <span style="font-weight: bold;">${Engine.getRoundLabel()} ${m.orderNumber}</span>
        <span>Game: <strong>${m.machineName}</strong></span>
        ${targetsHtml}
      </div>
      <div style="display: flex; gap: 20px;">
        <div style="flex: 1;"><small>Ball 1</small><div style="border-bottom: 1px solid #000; height: 20px;"></div></div>
        <div style="flex: 1;"><small>Ball 2</small><div style="border-bottom: 1px solid #000; height: 20px;"></div></div>
        <div style="flex: 1;"><small>Ball 3</small><div style="border-bottom: 1px solid #000; height: 20px;"></div></div>
      </div>
    </div>`;
  }).join('');

  printWindow.document.write(`
    <html>
      <head><style>body { font-family: sans-serif; padding: 20px; line-height: 1.2; }</style></head>
      <body>
        <div style="border-bottom: 2px solid #000; margin-bottom: 12px; padding-bottom: 6px;">
          <h1 style="margin: 0 0 10px 0;">Pinball Scoring Sheet</h1>
          <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
            <div>
              ${leagueName ? `<div><strong>League:</strong> ${leagueName}</div>` : ''}
              <div><strong>Event:</strong> ${eventName}</div>
            </div>
            <div style="text-align: right;">
              <div>Player: __________________________</div>
              <div>Date: ________</div>
            </div>
          </div>
          <div style="font-size: 0.9rem; line-height: 1.4;">
            ${instructions}
          </div>
        </div>
        ${framesHtml}
      </body>
    </html>`);
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
}