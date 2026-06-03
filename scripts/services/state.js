/**
 * State management for local player identity and UI preferences.
 */

export const getCurrentPlayerId = () => localStorage.getItem('currentPlayerId');
export const setCurrentPlayerId = (id) => 
  id ? localStorage.setItem('currentPlayerId', id) : localStorage.removeItem('currentPlayerId');

export const getDebugEnabled = () => localStorage.getItem('pb_debug_enabled') === 'true';
export const setDebugEnabled = (enabled) => localStorage.setItem('pb_debug_enabled', enabled);