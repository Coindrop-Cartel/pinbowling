/**
 * Centralized route configuration for the PinBowling application.
 */
export const ROUTES = [
  { path: 'index.php', label: 'Home' },
  { path: 'leagues.php', label: 'Leagues' },
  { path: 'players.php', label: 'Players' },
  { path: 'machines.php', label: 'Machines' },
  { path: 'locations.php', label: 'Locations' },
  { path: 'standings.php', label: 'Standings' },
  { path: 'scores.php', label: 'Scores' },
  { path: 'eventSetup.php', label: 'Setup' },
  { path: 'play.php', label: 'Play' },
  { path: 'management.php', label: 'Maintenance' }
];

/**
 * @param {string} path 
 * @param {Object} [params] 
 */
const buildUrl = (path, params = {}) => {
  if (typeof params !== 'object' || params === null) {
    params = { leagueId: params };
  }
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, value);
    }
  });
  const queryString = searchParams.toString();
  const basePath = window['APP_BASE'] || '';
  const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  const p = path.startsWith('/') ? path : '/' + path;
  return `${base}${p}${queryString ? '?' + queryString : ''}`;
};

ROUTES['HOME'] = (params = {}) => buildUrl('/', params);
ROUTES['SCORES'] = (params = {}) => buildUrl('/scores', params);
ROUTES['LEAGUES'] = (params = {}) => buildUrl('/leagues', params);
ROUTES['LEAGUE_SETUP'] = (params = {}) => buildUrl('/eventSetup', params);
ROUTES['STANDINGS'] = (params = {}) => buildUrl('/standings', params);
ROUTES['PLAYERS'] = (params = {}) => buildUrl('/players', params);
ROUTES['LOCATIONS'] = (params = {}) => buildUrl('/locations', params);
ROUTES['MACHINES'] = (params = {}) => buildUrl('/machines', params);
ROUTES['PLAY'] = (params = {}) => buildUrl('/play', params);
ROUTES['MAINTENANCE'] = (params = {}) => buildUrl('/management', params);
