/**
 * Returns the currently selected player ID from local storage.
 * @returns {string|null} The stored player ID, or null if none is set.
 */
export const getCurrentPlayerId = () => localStorage.getItem('currentPlayerId');

/**
 * Sets or clears the current player ID in local storage.
 * @param {string|null} id - The player ID to store, or null/falsy to remove it.
 */
export const setCurrentPlayerId = (id) => id ? localStorage.setItem('currentPlayerId', id) : localStorage.removeItem('currentPlayerId');

/**
 * Returns whether debug mode is enabled.
 * @returns {boolean} `true` if debug mode is enabled, `false` otherwise.
 */
export const getDebugEnabled = () => localStorage.getItem('pb_debug_enabled') === 'true';

/**
 * Enables or disables debug mode in local storage.
 * @param {boolean} enabled - Whether to enable debug mode.
 */
export const setDebugEnabled = (enabled) => localStorage.setItem('pb_debug_enabled', enabled);