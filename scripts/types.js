/**
 * Centralized JSDoc type definitions for the PinBowling application.
 */

/**
 * @typedef {Object} ScoringEngine
 * @property {function(number, number, number=): Object<string, number>} buildRoundValues
 * @property {function(Object<string, number>): Object<string, number>} filterThresholds
 * @property {function(Object, boolean, function, number=): string} getBonusTargetHtml
 * @property {function(): (a: [string, any], b: [string, any]) => number} getThresholdSort
 * @property {function(string|number, number, number): string} getThresholdLabel
 * @property {function(string|number, number, number): string} getThresholdRowStyle
 * @property {function(Object, function): string} getRowSummaryHtml
 * @property {function(Object, number): string} formatMark
 * @property {function(number, number): string} getMarkFormatting
 * @property {function(): string} getValue1Label
 * @property {function(): string} getValue2Label
 * @property {function(): number} getThresholdStart
 * @property {function(): number} getThresholdEnd
 * @property {function(): Array<number>} getThresholdRange
 */

/**
 * @typedef {Object} User
 * @property {number} id
 * @property {number|null} player_id
 * @property {string} username
 * @property {string} role
 * @property {string} created_at
 * @property {string} [player_name]
 */

/**
 * @typedef {Object} PinBowlingAPI
 * @property {function(number): Promise<any>} runCleanup
 * @property {function(): Promise<User|null>} getCurrentUser
 * @property {function(Object): Promise<any>} getLeagues
 */

// Force the file to be treated as a module so JSDoc imports work correctly.
export {};