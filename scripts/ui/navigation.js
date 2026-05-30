import { ROUTES } from '@scripts/routes.js';

/**
 * Initializes all elements with data-route attributes by setting their href
 * based on the centralized ROUTES configuration.
 */
export const initNavigation = () => {
  const routeLinks = document.querySelectorAll('[data-route]');
  const urlParams = new URLSearchParams(window.location.search);
  const PERSISTENT_PARAMS = ['leagueId', 'eventId', 'playerId'];
  
  routeLinks.forEach(link => {
    const routeName = link.dataset.route;
    if (ROUTES[routeName]) {
      const params = {};
      PERSISTENT_PARAMS.forEach(key => {
        if (urlParams.has(key)) {
          params[key] = urlParams.get(key);
        }
      });
      link.href = ROUTES[routeName](params);
    }
  });

  // Clear active classes first
  routeLinks.forEach(link => link.classList.remove('active'));
  document.querySelectorAll('.dropbtn').forEach(btn => btn.classList.remove('active'));

  // Normalize current path
  const rawPath = window.location.pathname.split('/').pop() || '';
  const currentBase = rawPath.replace(/\.php$/, '') || 'index';

  routeLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href && href !== 'javascript:void(0)') {
      const hrefBase = href.split('?')[0].split('/').pop().replace(/\.php$/, '') || 'index';
      if (hrefBase === currentBase) {
        link.classList.add('active');
        const dropdown = link.closest('.dropdown');
        if (dropdown) {
          const dropbtn = dropdown.querySelector('.dropbtn');
          if (dropbtn) {
            dropbtn.classList.add('active');
          }
        }
      }
    }
  });
};