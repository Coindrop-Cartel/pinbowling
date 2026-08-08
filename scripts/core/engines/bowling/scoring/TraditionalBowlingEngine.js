import { BowlingEngine } from '../BowlingEngine.js';
import { formatNumber } from '../../../../utils.js';

/**
 * Implementation of standard 10-pin Bowling scoring (PinBowling).
 * Handles strikes, spares, open frames, and 10th-frame bonus strikes.
 */
export class TraditionalBowlingEngine extends BowlingEngine {
  constructor(config = {}, options = {}) {
    super(config, options);
  }
}
