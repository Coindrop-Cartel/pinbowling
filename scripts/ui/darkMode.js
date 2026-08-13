/**
 * Dark Mode toggle controller for PinBowling.
 * Handles reading/saving preference in localStorage, toggling the 'dark-mode'
 * class on document.body, and updating the toggle button UI.
 */

const STORAGE_KEY = 'pb_dark_mode';

/**
 * Checks if dark mode is currently enabled in localStorage.
 * @returns {boolean}
 */
export function isDarkModeEnabled() {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

export const MOON_ICON_SVG = '<svg class="theme-toggle-icon" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
export const SUN_ICON_SVG = '<svg class="theme-toggle-icon" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';

/**
 * Updates the toggle button text and accessibility attributes based on mode state.
 * @param {boolean} [isDark]
 */
export function updateToggleButtonUI(isDark) {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  const active = isDark !== undefined ? isDark : isDarkModeEnabled();
  if (active) {
    btn.innerHTML = SUN_ICON_SVG;
    btn.setAttribute('aria-label', 'Toggle light mode');
    btn.setAttribute('title', 'Switch to Light Mode');
  } else {
    btn.innerHTML = MOON_ICON_SVG;
    btn.setAttribute('aria-label', 'Toggle dark mode');
    btn.setAttribute('title', 'Switch to Dark Mode');
  }
}

/**
 * Swaps the header logo image between light mode and dark mode variants.
 * @param {boolean} [isDark]
 */
export function updateHeaderLogo(isDark) {
  const navLogoImg = document.querySelector('.nav-logo img');
  if (!navLogoImg) return;
  const active = isDark !== undefined ? isDark : isDarkModeEnabled();
  if (active) {
    if (navLogoImg.src.includes('main-site-logo-header.png')) {
      navLogoImg.src = navLogoImg.src.replace('main-site-logo-header.png', 'main-site-logo-header-darkmode.png');
    }
  } else {
    if (navLogoImg.src.includes('main-site-logo-header-darkmode.png')) {
      navLogoImg.src = navLogoImg.src.replace('main-site-logo-header-darkmode.png', 'main-site-logo-header.png');
    }
  }
}

/**
 * Enables or disables dark mode, updating body classes, cookies, and localStorage.
 * @param {boolean} enabled
 * @returns {boolean}
 */
export function setDarkMode(enabled) {
  const isDark = Boolean(enabled);
  if (isDark) {
    document.documentElement.classList.add('dark-mode');
    document.body.classList.add('dark-mode');
  } else {
    document.documentElement.classList.remove('dark-mode');
    document.body.classList.remove('dark-mode');
  }
  try {
    localStorage.setItem(STORAGE_KEY, String(isDark));
    document.cookie = `pb_dark_mode=${isDark}; path=/; max-age=31536000`;
  } catch (err) {
    // Ignore storage errors if disabled
  }
  updateToggleButtonUI(isDark);
  updateHeaderLogo(isDark);
  return isDark;
}

/**
 * Toggles dark mode on or off.
 * @returns {boolean}
 */
export function toggleDarkMode() {
  return setDarkMode(!isDarkModeEnabled());
}

/**
 * Initializes dark mode state and event listeners on page load.
 */
export function initDarkMode() {
  const isDark = isDarkModeEnabled();
  if (isDark) {
    document.documentElement.classList.add('dark-mode');
    document.body.classList.add('dark-mode');
  } else {
    document.documentElement.classList.remove('dark-mode');
    document.body.classList.remove('dark-mode');
  }
  updateToggleButtonUI(isDark);
  updateHeaderLogo(isDark);

  const btn = document.getElementById('theme-toggle-btn');
  if (btn && !btn.dataset.darkModeBound) {
    btn.dataset.darkModeBound = 'true';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleDarkMode();
    });
  }
}
