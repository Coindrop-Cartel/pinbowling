/**
 * Scoring Provider
 */

const BowlingEngine = {
  getPinCount(frame, rawScore) {
    if (!frame || typeof rawScore !== 'number' || rawScore <= 0) return 0;
    const thresholds = Object.entries(frame.values)
      .map(([rank, score]) => ({ rank: Number(rank), score: Number(score) }))
      .sort((a, b) => a.score - b.score);
    let pins = 0;
    for (const threshold of thresholds) {
      if (rawScore >= threshold.score) {
        pins = Math.max(pins, threshold.rank);
      }
    }
    return pins;
  },

  /**
   * Calculates Target 1 (1.3x strike) and Target 2 (1.3x Target 1) for the last frame.
   * @param {Object} frame The frame object containing scoring values.
   * @returns {{t1: number, t2: number}} An object with calculated Target 1 and Target 2 scores.
   */
  getBonusTargets(frame) {
    const t1 = Math.round(frame.values[10] * 1.3);
    const t2 = Math.round(t1 * 1.3);
    return { t1, t2 };
  },

  /**
   * Complex logic for Frame 10.
   * Unlike frames 1-9, frame 10 allows up to 3 balls if the player achieves 
   * a mark (strike or spare). Strikes on subsequent balls use adjusted 
   * targets (multipliers) to simulate the difficulty of repeated strikes 
   * on the same machine.
   */
  getFrame10Data(frame, raw1, raw2, raw3) {
    const target1 = Number(frame.values[10] || 0);
    const target2 = Math.round(target1 * 1.3);
    const target3 = Math.round(target2 * 1.3);
    const hit1 = raw1 >= target1;
    const hit2 = raw2 >= target2;
    const hit3 = raw3 >= target3;
    const spare2 = !hit1 && raw2 >= target1;

    const c1 = this.getPinCount(frame, raw1);
    const c2 = this.getPinCount(frame, raw2);
    const c3 = this.getPinCount(frame, raw3);

    let mark = '';
    let score = 0;
    let firstPins = 0;
    let secondPins = 0;
    let thirdPins = 0;

    if (hit1) {
      firstPins = 10;
      if (hit2) {
        secondPins = 10;
        thirdPins = hit3 ? 10 : Math.max(0, c3 - c2);
        mark = `X X ${hit3 ? 'X' : thirdPins}`;
        score = 20 + thirdPins;
      } else if (hit3) {
        secondPins = 8;
        thirdPins = 2;
        mark = 'X 8/';
        score = 20;
      } else {
        secondPins = c2;
        thirdPins = Math.max(0, c3 - c2);
        mark = `X ${secondPins} ${thirdPins}`;
        score = 10 + secondPins + thirdPins;
      }
    } else if (spare2) {
      firstPins = 9;
      secondPins = 1;
      thirdPins = hit3 ? 10 : Math.max(0, c3 - c2);
      mark = `9/ ${hit3 ? 'X' : thirdPins}`;
      score = 10 + thirdPins;
    } else if (hit3) {
      firstPins = Math.min(c2, 8);
      secondPins = 10 - firstPins;
      thirdPins = 0;
      mark = `${firstPins}/`;
      score = 10;
    } else {
      firstPins = c2;
      secondPins = Math.max(0, c3 - c2);
      thirdPins = 0;
      mark = `${firstPins} ${secondPins}`;
      score = firstPins + secondPins;
    }

    return { order: frame.order_number, machine: frame.machine_name, type: 'tenth', mark, first: firstPins, second: secondPins, third: thirdPins, score };
  },

  getFrameDataFromValues(frame, raw1, raw2, raw3, isLastFrame = false) {
    if (isLastFrame) return this.getFrame10Data(frame, raw1, raw2, raw3);

    const c1 = this.getPinCount(frame, raw1);
    const c2 = this.getPinCount(frame, raw2);
    const c3 = this.getPinCount(frame, raw3);

    let type, first = 0, second = 0, score = 0;

    if (c1 >= 10) {
      type = 'strike'; first = 10; second = 0; score = 10;
    } else if (c2 >= 10) {
      type = 'spare2'; first = 9; second = 1; score = 10;
    } else if (c3 >= 10) {
      type = 'spare3'; first = Math.min(c2, 8); second = 10 - first; score = 10;
    } else {
      type = 'open'; first = c2; second = Math.max(0, c3 - c2); score = first + second;
    }
    return { order: frame.order_number, machine: frame.machine_name, type, first, second, score };
  },

  getNextBallValues(frameIndex, count, frameData) {
    const values = [];
    for (let current = frameIndex + 1; current < frameData.length && values.length < count; current += 1) {
      const next = frameData[current];
      if (next.type === 'strike') values.push(10);
      else values.push(next.first, next.second);
    }
    while (values.length < count) values.push(0);
    return values.slice(0, count);
  },

  formatMark(frame) {
    if (frame.type === 'tenth') return frame.mark;
    if (frame.type === 'strike') return 'X';
    if (frame.type === 'spare2' || frame.type === 'spare3') return `${frame.first}/`;
    return `${frame.first} ${frame.second}`;
  },

  calculateFrameResults(machines, scoreMap) {
    const maxOrder = machines.length > 0 ? Math.max(...machines.map(m => m.order_number)) : 0;

    const frameData = machines.map((frame) => {
      const entry = scoreMap[String(frame.order_number)] || { ball1: 0, ball2: 0, ball3: 0 };
      return this.getFrameDataFromValues(frame, Number(entry.ball1), Number(entry.ball2), Number(entry.ball3), frame.order_number === maxOrder);
    });

    let total = 0;
    const results = frameData.map((frame, index) => {
      let frameScore = frame.score;
      if (frame.type === 'strike') {
        const [next1, next2] = this.getNextBallValues(index, 2, frameData);
        frameScore = 10 + next1 + next2;
      } else if (frame.type === 'spare2' || frame.type === 'spare3') {
        const [next1] = this.getNextBallValues(index, 1, frameData);
        frameScore = 10 + next1;
      }
      total += frameScore;
      return { order: frame.order, machine: frame.machine, mark: this.formatMark(frame), score: frameScore };
    });
    return { frameResults: results, total };
  },

  buildFrameValues(score10, score1) {
    const values = {};
    if (score10 > 0 && score1 > 0) {
      for (let rank = 10; rank >= 1; rank -= 1) {
        const fraction = (rank - 1) / 9;
        values[rank] = Math.round(score1 + (score10 - score1) * fraction);
      }
      return values;
    }
    // ... (rest of logic from buildFrameValues)
    return null;
  }
};

/**
 * Placeholder for future Golf scoring format.
 */
const GolfEngine = {
  calculateFrameResults(machines, scoreMap) {
    // Implementation for Pingolf: Strokes vs Par
    return { frameResults: [], total: 0 };
  },
  buildFrameValues(target, par) {
    // Implementation for defining hole-in-one vs par thresholds
    return {};
  },
  getBonusTargets() { return { t1: 0, t2: 0 }; },
  formatMark(frame) { return ''; }
};

const ENGINES = {
  'bowling': BowlingEngine,
  'golf': GolfEngine
};

/**
 * Factory to retrieve the correct scoring logic based on the event format.
 * Defaults to 'bowling' for backward compatibility.
 * 
 * @param {string} format 
 * @returns {Object} The engine implementation
 */
export const getScoringEngine = (format = 'bowling') => {
  return ENGINES[format] || BowlingEngine;
};

export { BowlingEngine };