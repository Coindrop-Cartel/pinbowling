import { StrokesGolfEngine } from './StrokesGolfEngine.js';

/**
 * Placeholder for Golf Skins match play variant.
 */
export class SkinsGolfEngine extends StrokesGolfEngine {
  constructor(config = {}, options = {}) {
    super({ format: 'golf_skins', ...config }, options);
  }
}
