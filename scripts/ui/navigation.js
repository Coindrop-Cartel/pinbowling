import { ROUTES } from '@scripts/routes.js';
import { loadPage } from '@scripts/utils.js';

/**
 * Initializes all elements with data-route attributes by setting their href
 * based on the centralized ROUTES configuration.
 */
export const initNavigation = (containerSelector = '.nav-container') => {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  // Centralized helper to forcefully collapse the mobile taskbar and all dropdowns.
  // This replicates the "clean slate" logic of a full page reload.
  const collapseAll = () => {
    if (window.PB_DEBUG_MODE) console.log('[Navigation] Executing collapseAll');
    
    // Remove 'is-open' from all dropdown items and reset accessibility flags.
    const dropdowns = container.querySelectorAll('.nav-item.dropdown');
    dropdowns.forEach(item => {
      item.classList.remove('is-open');
      const btn = item.querySelector('.dropbtn');
      if (btn) {
        btn.setAttribute('aria-expanded', 'false');
      }
    });

    // Forcefully remove the global mobile taskbar active state.
    const navLinks = container.querySelector('.nav-links');
    if (navLinks) {
      navLinks.classList.remove('dropdown-active');
    }

    // Force blur to clear focus/sticky hover on mobile devices.
    // This is often required to make menus actually disappear in SPAs.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

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

      link.onclick = (e) => {
        // Stop propagation immediately to prevent parent container listeners 
        // (like dropdown toggles) from firing and re-opening the menu.
        e.stopPropagation();

        if (window.PB_DEBUG_MODE) {
          console.group(`[Navigation] Link Clicked: ${routeName}`);
          console.log('Target:', link.href);
        }

        const targetUrl = new URL(link.href, window.location.origin);
        const currentUrl = new URL(window.location.href, window.location.origin);
        
        // Collapse the UI for immediate visual feedback.
        collapseAll();

        if (targetUrl.pathname === currentUrl.pathname && targetUrl.search === currentUrl.search) {
          if (window.PB_DEBUG_MODE) console.log('Same page detected, preventing reload.');
          console.groupEnd();
          e.preventDefault();
          return;
        }

        e.preventDefault();
        if (window.PB_DEBUG_MODE) console.log('Initiating partial load via loadPage.');
        console.groupEnd();
        loadPage(link.href);
      };
    }
  });

  // Setup unified click-to-toggle for all dropdowns on mobile to prevent sticky :hover states
  container.querySelectorAll('.nav-item.dropdown').forEach(dropdown => {
    const btn = dropdown.querySelector('.dropbtn');
    if (btn) {
      btn.onclick = (e) => {
        if (window.innerWidth <= 768) {
          if (window.PB_DEBUG_MODE) {
            console.group('[Navigation] Dropdown Parent Clicked');
            console.log('Current Dropdown:', btn.textContent.trim());
          }

          e.preventDefault();
          e.stopPropagation();
          
          const wasOpen = dropdown.classList.contains('is-open');
          
          // Accordion: Close other open dropdowns first
          container.querySelectorAll('.nav-item.dropdown').forEach(other => {
            if (other !== dropdown) {
              other.classList.remove('is-open');
              other.querySelector('.dropbtn')?.setAttribute('aria-expanded', 'false');
            }
          });

          // Toggle current
          const isOpen = dropdown.classList.toggle('is-open');
          btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
          
          if (window.PB_DEBUG_MODE) console.log('New State:', isOpen ? 'OPEN' : 'CLOSED');

          // Force blur to clear "sticky" focus/hover on mobile devices
          if (!isOpen && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }

          const navLinks = container.querySelector('.nav-links');
          if (navLinks) {
            navLinks.classList.toggle('dropdown-active', !!container.querySelector('.nav-item.dropdown.is-open'));
          }
          console.groupEnd();
        }
      };
    }
  });

  // Clear active classes first
  routeLinks.forEach(link => link.classList.remove('active'));
  document.querySelectorAll('.dropbtn').forEach(btn => btn.classList.remove('active'));

  // Force collapse on init to handle back/forward buttons and initial load state
  collapseAll();

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