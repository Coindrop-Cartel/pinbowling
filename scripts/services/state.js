/**
 * State management for player identity and session-based credentials.
 */

export const getCurrentPlayerId = () => localStorage.getItem('currentPlayerId');
export const setCurrentPlayerId = (id) => 
  id ? localStorage.setItem('currentPlayerId', id) : localStorage.removeItem('currentPlayerId');

export const getLeaguePassword = (leagueId) => 
  sessionStorage.getItem(`leaguePass_${leagueId}`);
export const setLeaguePassword = (leagueId, password) => 
  password ? sessionStorage.setItem(`leaguePass_${leagueId}`, password) : sessionStorage.removeItem(`leaguePass_${leagueId}`);

export const getAdminSessionPassword = () => 
  sessionStorage.getItem('adminPassword');
export const setAdminSessionPassword = (password) => 
  password ? sessionStorage.setItem('adminPassword', password) : sessionStorage.removeItem('adminPassword');