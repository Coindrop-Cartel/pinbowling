import { ROUTES } from '@scripts/routes.js';
import { loadPage } from '@scripts/utils.js';

/**
 * Initializes all elements with data-route attributes by setting their href
 * based on the centralized ROUTES configuration. Also sets up dropdown
 * toggle behavior and mobile taskbar collapse logic.
 * @param {string} [containerSelector='.nav-container'] - CSS selector for the navigation container.
 * @returns {void}
 */
let _initialized = false;

export const resetNavigationState = () => {
  _initialized = false;
};

export const initNavigation = (containerSelector = '.nav-container') => {
  const container = document.querySelector(containerSelector);
  if (!container) return;
  if (_initialized) return;
  _initialized = true;

  const hamburgerBtn = container.querySelector('.hamburger-btn');
  const navCollapse = container.querySelector('.nav-collapse');

  /**
   * Centralized helper to forcefully collapse the mobile taskbar, all dropdowns, and hamburger menu.
   */
  const collapseAll = () => {
    if (window.PB_DEBUG_MODE) console.log('[Navigation] Executing collapseAll');
    
    if (navCollapse) navCollapse.classList.remove('nav-menu-open');
    if (hamburgerBtn) {
      hamburgerBtn.classList.remove('is-active');
      hamburgerBtn.setAttribute('aria-expanded', 'false');
    }

    container.querySelectorAll('.nav-item.dropdown').forEach(item => {
      item.classList.remove('is-open');
      item.querySelector('.dropbtn')?.setAttribute('aria-expanded', 'false');
    });

    const navLinks = container.querySelector('.nav-links');
    if (navLinks) navLinks.classList.remove('dropdown-active');

    // Only blur active elements that are inside the navigation container
    if (document.activeElement instanceof HTMLElement && container.contains(document.activeElement)) {
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

    // 2. Handle Hamburger Menu Toggle
    const hamburgerTarget = e.target.closest('.hamburger-btn');
    if (hamburgerTarget) {
      e.stopPropagation();
      const isOpen = navCollapse.classList.toggle('nav-menu-open');
      hamburgerTarget.classList.toggle('is-active', isOpen);
      hamburgerTarget.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      return;
    }

    // 3. Handle Dropdown Toggles (All Viewports & Touch Screens)
    if (dropbtn) {
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

  // Close dropdowns and hamburger menu when clicking outside the navbar
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      const hasOpenDropdown = !!container.querySelector('.nav-item.dropdown.is-open');
      const isMobileOpen = !!navCollapse?.classList.contains('nav-menu-open');
      if (hasOpenDropdown || isMobileOpen) {
        collapseAll();
      }
    }
  });

  document.addEventListener('pb:pageChanged', updateActiveState);
  updateActiveState();
  collapseAll();
};