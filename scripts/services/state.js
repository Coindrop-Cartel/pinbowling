/**
 * State management for player identity and session-based credentials.
 */

export const getCurrentPlayerId = () => localStorage.getItem('currentPlayerId');
export const setCurrentPlayerId = (id) => 
  id ? localStorage.setItem('currentPlayerId', id) : localStorage.removeItem('currentPlayerId');

export const getLeaguePassword = (leagueId) => 
  sessionStorage.getItem(`league_pass_${leagueId}`);
export const setLeaguePassword = (leagueId, password) => 
  password ? sessionStorage.setItem(`league_pass_${leagueId}`, password) : sessionStorage.removeItem(`league_pass_${leagueId}`);

export const getAdminSessionPassword = () => 
  sessionStorage.getItem('adminPassword');
export const setAdminSessionPassword = (password) => 
  password ? sessionStorage.setItem('adminPassword', password) : sessionStorage.removeItem('adminPassword');