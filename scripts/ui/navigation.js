import { ROUTES } from '@scripts/routes.js';

/**
 * Initializes all elements with data-route attributes by setting their href
 * based on the centralized ROUTES configuration.
 */
export const initNavigation = () => {
  const routeLinks = document.querySelectorAll('[data-route]');
  
  routeLinks.forEach(link => {
    const routeName = link.dataset.route;
    if (ROUTES[routeName]) {
      // Execute the route function to get the path
      link.href = ROUTES[routeName]();
    }
  });
};