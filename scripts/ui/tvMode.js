/**
 * Manager for TV display mode, handling auto-scrolling, visibility changes,
 * full-screen transitions, and screen wake locks.
 */
export class TvModeManager {
  /**
   * @param {Object} options Configuration options and callbacks.
   * @param {Function} options.refreshCallback Callback to refresh scoreboard data.
   * @param {Function} options.fitScreenCallback Callback to scale elements for TV.
   * @param {HTMLElement} [options.tvBtn] Button control to toggle TV mode.
   * @param {boolean} [options.isTvRoute=false] True if loaded on dedicated /tv route.
   */
  constructor(options = {}) {
    this.refreshCallback = options.refreshCallback;
    this.fitScreenCallback = options.fitScreenCallback;
    this.tvBtn = options.tvBtn;
    this.isTvRoute = options.isTvRoute || false;
    
    this.isTvMode = false;
    this.refreshInterval = null;
    this.scrollInterval = null;
    this.wakeLock = null;
    this.scrollAccumulator = 0;
    
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  /**
   * Toggles TV Mode states.
   * @param {boolean} [skipFullscreen=false] If true, skips browser fullscreen request.
   */
  async toggle(skipFullscreen = false) {
    this.isTvMode = !this.isTvMode;
    document.body.classList.toggle('tv-mode-active', this.isTvMode);

    if (this.isTvMode) {
      if (this.tvBtn) this.tvBtn.textContent = 'Exit (Esc)';
      if (this.fitScreenCallback) this.fitScreenCallback();

      // Periodically refresh data (default: 15 seconds)
      if (this.refreshCallback) {
        this.refreshInterval = setInterval(this.refreshCallback, 15000);
      }
      this.startAutoScroll();

      // Fullscreen requests must follow browser authorization patterns
      if (document.documentElement.requestFullscreen && !skipFullscreen) {
        document.documentElement.requestFullscreen().catch(err => {
          console.warn('[TV Mode] Fullscreen request deferred or denied:', err.message);
        });
      }

      // Wake lock requests to keep the screen alive
      if ('wakeLock' in navigator) {
        try {
          this.wakeLock = await navigator.wakeLock.request('screen');
        } catch (err) {
          console.error('[TV Mode] Wake Lock request failed:', err);
        }
      }

      document.addEventListener('keydown', this.handleKeyDown);
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    } else {
      if (this.tvBtn) this.tvBtn.textContent = 'TV Mode';
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
        this.refreshInterval = null;
      }
      this.stopAutoScroll();
      window.scrollTo(0, 0);

      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }

      if (this.wakeLock) {
        await this.wakeLock.release().catch(() => {});
        this.wakeLock = null;
      }

      document.removeEventListener('keydown', this.handleKeyDown);
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  /**
   * Escape key event hook.
   */
  handleKeyDown(e) {
    if (e.key === 'Escape' && this.isTvMode) {
      this.toggle();
    }
  }

  /**
   * Visbility change tab observer.
   */
  async handleVisibilityChange() {
    if (this.isTvMode && document.visibilityState === 'visible' && 'wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
      } catch (err) {
        console.error('[TV Mode] Re-acquiring Wake Lock failed:', err);
      }
    }
  }

  /**
   * Starts the TV Mode frame animation autoscroll loop.
   */
  startAutoScroll() {
    this.stopAutoScroll();
    
    const pixelsPerSecond = 10;
    let lastTimestamp = null;
    this.scrollAccumulator = window.scrollY;

    const step = (timestamp) => {
      if (!this.isTvMode) return;
      
      if (!lastTimestamp) {
        lastTimestamp = timestamp;
        this.scrollInterval = requestAnimationFrame(step);
        return;
      }

      const elapsed = timestamp - lastTimestamp;
      lastTimestamp = timestamp;

      this.scrollAccumulator += (pixelsPerSecond * elapsed) / 1000;
      window.scrollTo(0, Math.floor(this.scrollAccumulator));

      if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 2) {
        this.stopAutoScroll();
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          setTimeout(() => this.startAutoScroll(), 2000);
        }, 5000);
      } else {
        this.scrollInterval = requestAnimationFrame(step);
      }
    };
    
    this.scrollInterval = requestAnimationFrame(step);
  }

  /**
   * Stops the TV Mode frame animation loop.
   */
  stopAutoScroll() {
    if (this.scrollInterval) {
      cancelAnimationFrame(this.scrollInterval);
      this.scrollInterval = null;
    }
  }

  /**
   * Fully cleans up and releases all resources/bindings.
   */
  cleanup() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    this.stopAutoScroll();
    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
    document.body.classList.remove('tv-mode-active');
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }
}
