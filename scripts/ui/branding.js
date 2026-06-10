import { getScoringEngine } from '@core/engine.js';
import { getCookie } from '@scripts/utils.js';

/**
 * Refreshes the site's CSS classes, logos, and terminology based on the 
 * user's preferred scoring format (e.g., Bowling vs. Golf).
 * 
 * @param {string} [overrideFormat] - Force a specific format, ignoring cookies.
 */
export function applyPreferredTheme(overrideFormat) {
  const preferred = overrideFormat || getCookie('pb_preferred_format') || 'bowling';
  const engine = getScoringEngine(preferred);

  // Clear any previous theme classes and apply the current engine's theme
  document.body.classList.remove('theme-golf', 'theme-bowling');
  const themeClass = engine.getThemeClass();
  if (themeClass) document.body.classList.add(themeClass);

  // Update main site logo (if present on home page)
  const mainLogo = document.querySelector('.main-site-logo');
  if (mainLogo) {
    const lastSlash = mainLogo.src.lastIndexOf('/');
    const basePath = lastSlash !== -1 ? mainLogo.src.substring(0, lastSlash + 1) : '';
    mainLogo.src = `${basePath}main-site-logo-${engine.getBrandName().toLowerCase()}.png`;
  }

  // Update dynamic logos (header/nav)
  const logoImgs = document.querySelectorAll('.nav-logo img, .header-logo img, .site-logo img, #site-logo, .hero-logo-btn');
  logoImgs.forEach(img => {
    const lastSlash = img.src.lastIndexOf('/');
    const basePath = lastSlash !== -1 ? img.src.substring(0, lastSlash + 1) : '';
    img.src = basePath + engine.getLogoImage();
    img.alt = engine.getBrandName() + ' Logo';
  });

  // Update nav brand name spans (if present)
  document.querySelectorAll('.nav-logo span').forEach(span => {
    span.textContent = engine.getBrandName();
  });

  // Update all play CTA links (nav and home button)
  document.querySelectorAll('[data-route="PLAY"]').forEach(link => {
    link.textContent = engine.getPlayActionLabel();
  });

  // Update homepage descriptive text
  const logicText = document.getElementById('scoring-logic-text');
  if (logicText) logicText.textContent = engine.getScoringDescription();
}

/**
 * Generates a badge <span> for a scoring format.
 * 
 * @param {string} format - Format ID (e.g. 'golf').
 * @returns {string} HTML string.
 */
export function getFormatBadgeHtml(format) {
  if (!format) return '';
  const engine = getScoringEngine(format);
  const label = engine.getBrandName();
  const themeClass = engine.getThemeClass();
  return `<span class="badge ${themeClass}">${label}</span>`;
}

/**
 * Dynamically scales the TV Mode container to fit the viewport width.
 */
export function fitTVModeToScreen() {
  const container = document.getElementById('tv-mode-content');
  if (!container || !document.body.classList.contains('tv-mode-active')) {
    if (container) {
      container.style.transform = '';
      container.style.width = '';
    }
    return;
  }

  container.style.transform = 'scale(1)';
  container.style.width = 'auto';

  const viewportWidth = window.innerWidth - 40;
  const contentWidth = container.offsetWidth;

  if (contentWidth > viewportWidth) {
    const scaleFactor = viewportWidth / contentWidth;
    container.style.transformOrigin = 'top center';
    container.style.transform = `scale(${scaleFactor})`;
    container.style.width = (100 / scaleFactor) + '%';
  }
}