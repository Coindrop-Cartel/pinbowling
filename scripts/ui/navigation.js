import { ROUTES } from '@scripts/routes.js';

/**
 * Initializes all elements with data-route attributes by setting their href
 * based on the centralized ROUTES configuration.
 */
export const initNavigation = (containerSelector = '.nav-container') => {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  const routeLinks = container.querySelectorAll('[data-route]');
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
  // Using filter(Boolean) ensures trailing slashes don't result in an empty string
  const rawPath = window.location.pathname.split('/').filter(Boolean).pop() || '';
  const currentBase = rawPath.replace(/\.php$/, '') || 'index';

  routeLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href && href !== 'javascript:void(0)') {
      const rawHref = href.split('?')[0].split('/').filter(Boolean).pop() || '';
      const hrefBase = rawHref.replace(/\.php$/, '') || 'index';
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