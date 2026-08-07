/**
 * Shared print HTML formatting helpers and stylesheet link generator.
 * @module ui/printing/printStyles
 */

export function formatPrintTargets(targets, formatNumberFn) {
  return targets.map((t, index) => {
    const val = t.format ? formatNumberFn(t.value) : t.value;
    const displayVal = t.underline ? `<u>${val}</u>` : val;
    return `<span class="${index > 0 ? 'ml-15' : ''}">${t.label}: <strong>${displayVal}</strong></span>`;
  }).join('');
}

export function getPrintStylesheetLink() {
  return '<link rel="stylesheet" href="styles/print.css">';
}

/** Backward compatibility exports for cached module imports */
export const scoreSheetCss = '';
export const printCss = '';
