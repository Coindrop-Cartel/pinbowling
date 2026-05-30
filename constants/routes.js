// Use the base path provided by the PHP layout, falling back to empty string
// This ensures JS navigation always matches the server-side directory structure.
const BASE_PATH = window.APP_BASE || '';

/**
 * Internal helper to construct routes with optional query parameters.
 * @param {string} path - The page path (e.g., '/leagues').
 * @param {Object} params - Key-value pairs for query parameters.
 * @returns {string} The fully qualified application-relative URL.
 */
const buildUrl = (path, params = {}) => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, value);
    }
  });
  const queryString = searchParams.toString();
  return `${BASE_PATH}${path}${queryString ? '?' + queryString : ''}`;
};

export const ROUTES = {
  HOME: (params = {}) => buildUrl('/', params),
  LEAGUES: (params = {}) => buildUrl('/leagues', params),
  MACHINES: (params = {}) => buildUrl('/machines', params),
  PLAYERS: (params = {}) => buildUrl('/players', params),
  LOCATIONS: (params = {}) => buildUrl('/locations', params),
  STANDINGS: (params = {}) => buildUrl('/standings', params),
  SCORES: (params = {}) => buildUrl('/scores', params),
  SETTINGS: (params = {}) => buildUrl('/settings', params),
};

/**
 * Navigates to a specific internal route.
 * @param {string} url - The destination path (typically generated via ROUTES).
 */
export const navigateTo = (url) => {
  if (url) window.location.href = url;
};
