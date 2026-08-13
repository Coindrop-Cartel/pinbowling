import { getPrintStylesheetLink } from './printStyles.js';
import { escapeHTML } from '../../utils.js';

/**
 * Generates a clean printable report window for WPPR calculations.
 * 
 * @param {Object} options
 * @param {string} options.eventTitle Name of the event/tournament.
 * @param {Object} options.summary Summary stats (firstPlaceWPPR, baseValue, ratingTVA, rankingTVA, tgp, booster).
 * @param {string} options.pgmBannerText PGM calculation explanation text.
 * @param {Object} options.eventStats Per-player imported event scores and PGM stats.
 * @param {Array} options.distribution Calculated WPPR point distribution list.
 * @param {Array} options.contributions Per-player base and TVA contribution list.
 * @param {Array} options.playerState State list of players in finishing order.
 */
export function printWpprResults({
  eventTitle = 'Tournament WPPR Estimation',
  summary = {},
  pgmBannerText = '',
  eventStats = null,
  distribution = [],
  contributions = [],
  playerState = []
}) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popup windows in your browser to print the WPPR report.');
    return;
  }

  const currentDate = new Date().toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  let html = `<!DOCTYPE html>
<html>
<head>
  <title>WPPR Estimation Report - ${escapeHTML(eventTitle)}</title>
  ${getPrintStylesheetLink()}
  <style>
    body.print-window-body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 20px; color: #111; line-height: 1.4; background: #fff; }
    .report-header { border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
    .report-header h1 { margin: 0; font-size: 24px; color: #111; }
    .report-header p { margin: 4px 0 0 0; color: #555; font-size: 14px; font-weight: 600; }
    .report-meta { text-align: right; font-size: 12px; color: #666; }
    
    .stats-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; background: #f9f9f9; border: 1px solid #ddd; }
    .stats-table td { padding: 10px 14px; text-align: center; border: 1px solid #ddd; width: 16.66%; }
    .stats-table .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; display: block; margin-bottom: 4px; }
    .stats-table .value { font-size: 18px; font-weight: bold; color: #111; }
    .stats-table .value.highlight { font-size: 22px; color: #0056b3; }

    .pgm-box { background: #eef6fc; border-left: 4px solid #0056b3; padding: 10px 14px; font-size: 12px; margin-bottom: 20px; border-radius: 2px; }

    .section-title { font-size: 16px; font-weight: bold; border-bottom: 1.5px solid #333; padding-bottom: 4px; margin: 24px 0 10px 0; color: #111; }
    
    .wppr-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
    .wppr-table th { background: #f2f2f2; border: 1px solid #ccc; padding: 7px 10px; text-align: left; font-weight: 600; }
    .wppr-table td { border: 1px solid #ddd; padding: 7px 10px; }
    .wppr-table tr:nth-child(even) td { background: #fafafa; }
    .wppr-table .text-center { text-align: center; }
    .wppr-table .text-right { text-align: right; }
    .wppr-table .font-bold { font-weight: bold; }
    .wppr-table .highlight-cell { color: #0056b3; font-weight: bold; }

    @media print {
      body.print-window-body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body class="print-window-body">
  <div class="report-header">
    <div>
      <h1>WPPR Points Estimation Report</h1>
      <p>${escapeHTML(eventTitle)}</p>
    </div>
    <div class="report-meta">
      <div><strong>Date:</strong> ${currentDate}</div>
      <div>Official IFPA v6.2 Formula Engine</div>
    </div>
  </div>

  <table class="stats-table">
    <tr>
      <td>
        <span class="label">1st Place WPPR</span>
        <span class="value highlight">${summary.firstPlaceWPPR || '0.00'}</span>
      </td>
      <td>
        <span class="label">Base Value</span>
        <span class="value">${summary.baseValue || '0.00'}</span>
      </td>
      <td>
        <span class="label">Rating TVA</span>
        <span class="value">${summary.ratingTVA || '0.00'}</span>
      </td>
      <td>
        <span class="label">Ranking TVA</span>
        <span class="value">${summary.rankingTVA || '0.00'}</span>
      </td>
      <td>
        <span class="label">TGP %</span>
        <span class="value">${summary.tgp || '100%'}</span>
      </td>
      <td>
        <span class="label">Booster</span>
        <span class="value">${summary.booster || '100%'}</span>
      </td>
    </tr>
  </table>
  `;

  if (pgmBannerText) {
    const pgmFormatLabel = (eventStats && eventStats.format === 'golf') ? 'Pin-Golf' : 'Pin-Bowling';
    html += `<div class="pgm-box"><strong>${pgmFormatLabel} PGM Calculation:</strong> ${escapeHTML(pgmBannerText)}</div>`;
  }

  // 1. Event stats table (if event is imported)
  if (eventStats && Array.isArray(eventStats.players) && eventStats.players.length > 0) {
    const isGolf = eventStats.format === 'golf';
    html += `
    <div class="section-title">Imported Event Performance & PGM Stats</div>
    <table class="wppr-table">
      <thead>
        <tr>
          <th style="width: 40px;" class="text-center">Pos.</th>
          <th>Player Name</th>
          <th class="text-right">${isGolf ? 'Total Score (Strokes)' : 'Total Score'}</th>
          <th class="text-center">${isGolf ? 'Strokes Played' : 'Pins Left'}</th>
          <th class="text-center">${isGolf ? 'Avg / Hole' : 'Avg / Frame'}</th>
          <th class="text-center">${isGolf ? '1' : 'X'}</th>
          <th class="text-center">${isGolf ? '2' : '9/'}</th>
          <th class="text-center">${isGolf ? '3' : 'Spares'}</th>
          <th class="text-center">Opens</th>
        </tr>
      </thead>
      <tbody>
    `;
    eventStats.players.forEach((p, idx) => {
      const avg = (p.ballsPlayed / (eventStats.numHoles || 10)).toFixed(2);
      html += `
        <tr>
          <td class="text-center">${idx + 1}</td>
          <td><strong>${escapeHTML(p.name)}</strong></td>
          <td class="text-right">${p.total}</td>
          <td class="text-center">${p.ballsPlayed}</td>
          <td class="text-center">${avg}</td>
          <td class="text-center">${p.ball1Count ?? p.strikes ?? 0}</td>
          <td class="text-center">${p.ball2Count ?? p.spares ?? 0}</td>
          <td class="text-center">${p.ball3Count ?? 0}</td>
          <td class="text-center">${p.opens ?? 0}</td>
        </tr>
      `;
    });
    html += `</tbody></table>`;
  }

  // 2. WPPR Distribution Table (Full Width 100%)
  html += `
  <div class="section-title">WPPR Distribution (Open)</div>
  <table class="wppr-table">
    <thead>
      <tr>
        <th style="width: 50px;" class="text-center">Pos.</th>
        <th>Player Name</th>
        <th class="text-right" style="width: 120px;">Lin.</th>
        <th class="text-right" style="width: 120px;">Dyn.</th>
        <th class="text-right" style="width: 140px;">Total WPPR</th>
      </tr>
    </thead>
    <tbody>
  `;

  distribution.forEach((item) => {
    const pName = item.name || (playerState[item.position - 1] ? playerState[item.position - 1].name : `Player ${item.position}`);
    html += `
      <tr>
        <td class="text-center font-bold">${item.isTie ? `T-${item.position}` : item.position}</td>
        <td><strong>${escapeHTML(pName)}</strong></td>
        <td class="text-right">${item.linear.toFixed(2)}</td>
        <td class="text-right">${item.dynamic.toFixed(2)}</td>
        <td class="text-right highlight-cell">${item.total.toFixed(2)}</td>
      </tr>
    `;
  });

  html += `
    </tbody>
  </table>
  `;

  // 3. Player Contributions Table (Full Width 100%, Stacked Below Distribution)
  html += `
  <div class="section-title">Player Contributions (Open)</div>
  <table class="wppr-table">
    <thead>
      <tr>
        <th>Player Name</th>
        <th style="width: 110px;">IFPA ID</th>
        <th style="width: 110px;">IFPA Rank</th>
        <th style="width: 130px;">Match Play Rating</th>
        <th class="text-right" style="width: 110px;">Base Contrib.</th>
        <th class="text-right" style="width: 110px;">Rating TVA</th>
        <th class="text-right" style="width: 110px;">Ranking TVA</th>
        <th class="text-right" style="width: 120px;">Total Contrib.</th>
      </tr>
    </thead>
    <tbody>
  `;

  contributions.forEach((p) => {
    html += `
      <tr>
        <td><strong>${escapeHTML(p.name)}</strong></td>
        <td>${p.ifpaId ? `#${p.ifpaId}` : '-'}</td>
        <td>${p.ranking > 0 ? `#${p.ranking}` : '-'}</td>
        <td>${p.rating > 0 ? Number(p.rating).toFixed(2) : '-'}</td>
        <td class="text-right">${p.baseContribution.toFixed(2)}</td>
        <td class="text-right">${p.ratingContribution.toFixed(2)}</td>
        <td class="text-right">${p.rankingContribution.toFixed(2)}</td>
        <td class="text-right font-bold">${p.totalContribution.toFixed(2)}</td>
      </tr>
    `;
  });

  html += `
    </tbody>
  </table>

</body>
</html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 250);
}
