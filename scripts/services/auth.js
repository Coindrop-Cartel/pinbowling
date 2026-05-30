import { getAdminSessionPassword, setAdminSessionPassword, getLeaguePassword, setLeaguePassword } from './state.js';
import { showPrompt } from '../ui/uiComponents.js';

/**
 * Verifies if the user has global admin access. 
 * Prompts for password if not already in session.
 */
export async function requireAdmin(message = 'Enter Admin Password to continue:') {
  if (!window.PB_ADMIN_PASSWORD) return true;
  
  let pass = getAdminSessionPassword();
  if (pass === window.PB_ADMIN_PASSWORD) return true;
  
  pass = await showPrompt(message);
  if (pass === null) return false;
  
  if (pass === window.PB_ADMIN_PASSWORD) {
    setAdminSessionPassword(pass);
    return true;
  }
  
  alert('Incorrect Admin Password.');
  return false;
}

/**
 * Wraps an action that requires either a League Password or Admin Password.
 * Handles prompting and automatic session clearing if the API returns 401.
 */
export async function runAuthorizedLeagueAction(leagueId, actionCallback) {
  let pass = getLeaguePassword(leagueId) || getAdminSessionPassword();
  
  if (!pass || (pass !== window.PB_ADMIN_PASSWORD && !getLeaguePassword(leagueId))) {
    pass = await showPrompt(`Enter League Password (or Admin Password) to continue:`, 'League Access');
    if (pass === null) return;
    
    if (pass === window.PB_ADMIN_PASSWORD) setAdminSessionPassword(pass);
    else setLeaguePassword(leagueId, pass);
  }

  try {
    await actionCallback();
  } catch (err) {
    if (err.message.includes('Unauthorized')) {
      setLeaguePassword(leagueId, null);
      setAdminSessionPassword(null);
      alert('Invalid Password.');
    } else throw err;
  }
}