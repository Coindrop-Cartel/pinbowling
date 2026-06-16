import { ROUTES } from '@scripts/routes.js';
import { loadPage } from '@scripts/utils.js';

/**
 * Initializes all elements with data-route attributes by setting their href
 * based on the centralized ROUTES configuration. Also sets up dropdown
 * toggle behavior and mobile taskbar collapse logic.
 * @param {string} [containerSelector='.nav-container'] - CSS selector for the navigation container.
 * @returns {void}
 */
export const initNavigation = (containerSelector = '.nav-container') => {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  /**
   * Centralized helper to forcefully collapse the mobile taskbar and all dropdowns.
   */
  const collapseAll = () => {
    if (window.PB_DEBUG_MODE) console.log('[Navigation] Executing collapseAll');
    
    container.querySelectorAll('.nav-item.dropdown').forEach(item => {
      item.classList.remove('is-open');
      item.querySelector('.dropbtn')?.setAttribute('aria-expanded', 'false');
    });

    const navLinks = container.querySelector('.nav-links');
    if (navLinks) navLinks.classList.remove('dropdown-active');

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  /**
   * Updates the 'active' visual state of links based on current URL.
   */
  const updateActiveState = () => {
    const rawPath = window.location.pathname.split('/').filter(Boolean).pop() || '';
    const currentBase = rawPath.replace(/\.php$/, '') || 'index';

    document.querySelectorAll('.dropbtn').forEach(btn => btn.classList.remove('active'));
    
    container.querySelectorAll('[data-route]').forEach(link => {
      const href = link.getAttribute('href');
      link.classList.remove('active');
      
      if (href && href !== 'javascript:void(0)') {
        const rawHref = href.split('?')[0].split('/').filter(Boolean).pop() || '';
        const hrefBase = rawHref.replace(/\.php$/, '') || 'index';
        if (hrefBase === currentBase) {
          link.classList.add('active');
          link.closest('.dropdown')?.querySelector('.dropbtn')?.classList.add('active');
        }
      }
    });
  };

  const routeLinks = container.querySelectorAll('[data-route]');
  const urlParams = new URLSearchParams(window.location.search);
  const PERSISTENT_PARAMS = ['leagueId', 'eventId', 'playerId'];
  
  // Initialize static HREFs for SEO and native link features (right-click, hover).
  routeLinks.forEach(link => {
    const routeName = link.dataset.route;
    if (ROUTES[routeName]) {
      const params = {};
      PERSISTENT_PARAMS.forEach(key => { if (urlParams.has(key)) params[key] = urlParams.get(key); });
      link.href = ROUTES[routeName](params);
    }
  });

  // WORLD-CLASS PERFORMANCE: Use event delegation for all navigation and UI toggles.
  // This ensures that links revealed via auth updates (like Admin items) are correctly 
  // intercepted by the SPA router without needing to re-bind listeners.
  container.addEventListener('click', (e) => {
    const link = e.target.closest('[data-route]');
    const dropbtn = e.target.closest('.dropbtn');
    
    // 1. Handle SPA Routing via data-route
    if (link) {
      const routeName = link.dataset.route;
      if (!ROUTES[routeName]) return;
      
      // Only handle left clicks without modifiers to allow native browser behaviors
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

      e.preventDefault();
      e.stopPropagation();
      collapseAll();

      let targetHref = link.href;
      const rawPath = window.location.pathname.split('/').filter(Boolean).pop() || '';
      const currentBase = rawPath.replace(/\.php$/, '') || 'index';

      // Reset Logic: Clicking Scores/Standings while already on that page clears filters.
      if ((currentBase === 'scores' && routeName === 'SCORES') || 
          (currentBase === 'standings' && routeName === 'STANDINGS')) {
        const resetUrl = new URL(targetHref);
        resetUrl.searchParams.delete('eventId');
        targetHref = resetUrl.toString();
      }

      const targetUrl = new URL(targetHref, window.location.origin);
      const currentUrl = new URL(window.location.href, window.location.origin);
      
      if (targetUrl.pathname === currentUrl.pathname && targetUrl.search === currentUrl.search) return;
      loadPage(targetHref);
    }

    // 2. Handle Dropdown Toggles (Mobile View)
    if (dropbtn && window.innerWidth <= 768) {
      const dropdown = dropbtn.closest('.nav-item.dropdown');
      if (dropdown) {
        e.preventDefault();
        e.stopPropagation();

        if (window.PB_DEBUG_MODE) console.log('[Navigation] Dropdown Toggle:', dropbtn.textContent.trim());

        // Accordion behavior: close others
        container.querySelectorAll('.nav-item.dropdown').forEach(other => {
          if (other !== dropdown) {
            other.classList.remove('is-open');
            other.querySelector('.dropbtn')?.setAttribute('aria-expanded', 'false');
          }
        });

        const isOpen = dropdown.classList.toggle('is-open');
        dropbtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

        const navLinks = container.querySelector('.nav-links');
        if (navLinks) {
          navLinks.classList.toggle('dropdown-active', !!container.querySelector('.nav-item.dropdown.is-open'));
        }
      }
    }
  });
  
  document.addEventListener('pb:pageChanged', updateActiveState);
  updateActiveState();
  collapseAll();
};