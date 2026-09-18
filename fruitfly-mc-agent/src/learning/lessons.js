// This is the actual "learn from its mistakes" mechanism: unlike the
// bandit (which only nudges non-critical strategic choices), lessons
// directly retune the survival-critical thresholds in stateMachine.js
// based on *why* the agent has died before, persisted in memory.lessons
// across restarts. A bot that keeps dying to creepers gets more cautious
// around creepers specifically; one that starves keeps a bigger food
// buffer; one that dies fighting at low health raises the flee threshold.

const DEFAULTS = {
  fleeHealthThreshold: 6,
  foodBufferThreshold: 14, // eat/harvest urgently at or below this
  stockpileFoodTarget: 6, // proactively keep at least this many food units on hand
  hazardCaution: 0, // extra blocks of margin kept from lava/fire once burned by it
};

const MAX_FLEE_HEALTH_THRESHOLD = 14; // never so cautious it refuses to ever fight
const MAX_FOOD_BUFFER_THRESHOLD = 18;
const MAX_STOCKPILE_TARGET = 12;
const MAX_HAZARD_CAUTION = 5;
const HOSTILE_AVOID_AFTER_LOSSES = 2; // deaths to the same mob type before FruitFly just stops engaging it

export function createLessonsState() {
  return {
    ...DEFAULTS,
    deathsByCause: {}, // { starvation: 2, combat: 1, environmental_hazard: 0, unknown: 0 }
    lossesByHostile: {}, // { creeper: 2, zombie: 1 } -- combat deaths, keyed by the mob that got the kill
  };
}

/**
 * Determine why FruitFly most likely died, from the last AgentState
 * snapshot taken before the death event fired (mineflayer's 'death' event
 * doesn't report a cause, so this is inference from context, in priority
 * order of how unambiguous each signal is).
 */
export function classifyDeathCause(lastState) {
  if (!lastState) return 'unknown';
  if (lastState.inLavaOrDanger || lastState.onFire) return 'environmental_hazard';
  if (lastState.food <= 2) return 'starvation';
  if (lastState.hostileNearby) return 'combat';
  if (lastState.health <= 6) return 'unknown_low_health';
  return 'unknown';
}

/**
 * Update lessons in place after a death, returning what changed (for
 * logging). hostileType is the mob name FruitFly was near when it died,
 * if classifyDeathCause returned 'combat'.
 */
export function applyDeathLesson(lessons, cause, hostileType) {
  lessons.deathsByCause[cause] = (lessons.deathsByCause[cause] || 0) + 1;
  const changes = { cause };

  if (cause === 'starvation') {
    lessons.foodBufferThreshold = Math.min(lessons.foodBufferThreshold + 2, MAX_FOOD_BUFFER_THRESHOLD);
    lessons.stockpileFoodTarget = Math.min(lessons.stockpileFoodTarget + 2, MAX_STOCKPILE_TARGET);
    changes.foodBufferThreshold = lessons.foodBufferThreshold;
    changes.stockpileFoodTarget = lessons.stockpileFoodTarget;
  } else if (cause === 'combat') {
    lessons.fleeHealthThreshold = Math.min(lessons.fleeHealthThreshold + 2, MAX_FLEE_HEALTH_THRESHOLD);
    changes.fleeHealthThreshold = lessons.fleeHealthThreshold;
    if (hostileType) {
      lessons.lossesByHostile[hostileType] = (lessons.lossesByHostile[hostileType] || 0) + 1;
      changes.hostileLosses = { [hostileType]: lessons.lossesByHostile[hostileType] };
    }
  } else if (cause === 'environmental_hazard') {
    lessons.hazardCaution = Math.min(lessons.hazardCaution + 1, MAX_HAZARD_CAUTION);
    changes.hazardCaution = lessons.hazardCaution;
  } else if (cause === 'unknown_low_health') {
    // Ambiguous (fall damage, unseen ranged attack, etc.) -- still worth
    // being a little more conservative about health in general.
    lessons.fleeHealthThreshold = Math.min(lessons.fleeHealthThreshold + 1, MAX_FLEE_HEALTH_THRESHOLD);
    changes.fleeHealthThreshold = lessons.fleeHealthThreshold;
  }

  return changes;
}

/**
 * Derive the tuning object stateMachine.decideNextAction() consumes from
 * persisted lessons: thresholds plus the set of hostile mob types that
 * have beaten FruitFly enough times to always flee from, regardless of
 * current health/weapon status.
 */
export function getTuning(lessons) {
  const merged = { ...DEFAULTS, ...lessons };
  const hostileAvoid = new Set(
    Object.entries(lessons.lossesByHostile || {})
      .filter(([, losses]) => losses >= HOSTILE_AVOID_AFTER_LOSSES)
      .map(([name]) => name)
  );
  return {
    fleeHealthThreshold: merged.fleeHealthThreshold,
    foodBufferThreshold: merged.foodBufferThreshold,
    stockpileFoodTarget: merged.stockpileFoodTarget,
    hazardCaution: merged.hazardCaution,
    hostileAvoid,
  };
}

export const defaultTuning = getTuning(createLessonsState());
