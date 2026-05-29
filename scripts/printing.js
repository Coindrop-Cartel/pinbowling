import { getScoringEngine } from './engine.js';
import { formatNumber } from './utils.js';

/**
 * Generates large printable signs showing target scores for each machine.
 */
export function printMachineScores(machines, format = 'bowling') {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return alert('Please allow popups to print.');

  const maxOrder = machines.length > 0 ? Math.max(...machines.map(m => m.order_number)) : 0;
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
            <h1 style="margin: 0; font-size: 4rem;">${Engine.getRoundLabel()} ${m.order_number}</h1>
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
  setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
}