/**
 * Centralized route configuration for the PinBowling application.
 */
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
    if (value !== undefined && value !== null && value !== '' && String(value) !== 'undefined') {
      searchParams.append(key, value);
    }
  });
  const queryString = searchParams.toString();
  const basePath = window['APP_BASE'] || '';
  const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  const p = path.startsWith('/') ? path : '/' + path;
  return `${base}${p}${queryString ? '?' + queryString : ''}`;
};

export const ROUTE_PATHS = {
  HOME: (params = {}) => buildUrl('/', params),
  SCORES: (params = {}) => buildUrl('/scores', params),
  LEAGUES: (params = {}) => buildUrl('/leagues', params),
  TEAMS: (params = {}) => buildUrl('/teams', params),
  LEAGUE_SETUP: (params = {}) => buildUrl('/eventSetup', params),
  STANDINGS: (params = {}) => buildUrl('/standings', params),
  PLAYERS: (params = {}) => buildUrl('/players', params),
  LOCATIONS: (params = {}) => buildUrl('/locations', params),
  MACHINES: (params = {}) => buildUrl('/machines', params),
  PLAY: (params = {}) => buildUrl('/play', params),
  MAINTENANCE: (params = {}) => buildUrl('/management', params),
};

export const ROUTES = [
  { path: ROUTE_PATHS.HOME(), label: 'Home' },
  { path: ROUTE_PATHS.LEAGUES(), label: 'Leagues' },
  { path: ROUTE_PATHS.PLAYERS(), label: 'Players' },
  { path: ROUTE_PATHS.TEAMS(), label: 'Teams' },
  { path: ROUTE_PATHS.MACHINES(), label: 'Machines' },
  { path: ROUTE_PATHS.LOCATIONS(), label: 'Locations' },
  { path: ROUTE_PATHS.STANDINGS(), label: 'Standings' },
  { path: ROUTE_PATHS.SCORES(), label: 'Scores' },
  { path: ROUTE_PATHS.LEAGUE_SETUP(), label: 'Setup' },
  { path: ROUTE_PATHS.PLAY(), label: 'Play' },
  { path: ROUTE_PATHS.MAINTENANCE(), label: 'Maintenance' }
];
