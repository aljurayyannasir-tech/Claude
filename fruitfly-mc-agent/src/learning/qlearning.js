// Real tabular Q-learning (temporal-difference, epsilon-greedy over a
// discretized state space with a Bellman update) -- not the running-average
// bandit in bandit.js, and not the rule-based threshold retuning in
// lessons.js. This is intentionally scoped to a single decision point:
// FIGHT vs FLEE once the hard safety rules in stateMachine.js have already
// ruled out anything unsafe (critical health, unarmed, a mob type learned
// to be lethal). Within that "safe either way" zone, Q-learning is free to
// develop its own preferences from experience -- e.g. learning that
// fighting medium-threat mobs with only wooden tools tends to cost more
// health than it's worth, well before that ever escalates into the harder
// "avoid this mob entirely" lesson.
//
// Q(s,a) is stored as qState.table[stateKey][action], updated with the
// standard one-step TD rule:
//   Q(s,a) <- Q(s,a) + alpha * (reward + gamma * max_a' Q(s',a') - Q(s,a))

const DEFAULT_EPSILON = 0.15;
const DEFAULT_ALPHA = 0.3; // learning rate
const DEFAULT_GAMMA = 0.7; // discount on future value

const HARD_MOBS = new Set([
  'creeper', 'enderman', 'ravager', 'blaze', 'wither_skeleton', 'evoker',
  'piglin_brute', 'hoglin', 'guardian', 'elder_guardian', 'ghast', 'vindicator',
]);
const MEDIUM_MOBS = new Set(['witch', 'pillager', 'stray', 'husk', 'drowned', 'cave_spider']);

export function classifyHostileCategory(hostileType) {
  if (!hostileType) return 'unknown';
  if (HARD_MOBS.has(hostileType)) return 'hard';
  if (MEDIUM_MOBS.has(hostileType)) return 'medium';
  return 'easy';
}

export function healthBucket(health) {
  if (health >= 15) return 'high';
  if (health >= 8) return 'medium';
  return 'low';
}

export function buildCombatStateKey({ healthBucket: hb, toolTier, hostileCategory }) {
  return `${hb}|${toolTier}|${hostileCategory}`;
}

export function createQState() {
  return { table: {} };
}

function getQValues(qState, stateKey) {
  if (!qState.table[stateKey]) {
    qState.table[stateKey] = { FIGHT: 0, FLEE: 0 };
  }
  return qState.table[stateKey];
}

/**
 * Epsilon-greedy action selection over Q(stateKey, ·). Read-only aside
 * from lazily initializing an unseen state's values to 0 (does not count
 * as "learning" -- no reward has been observed yet).
 */
export function chooseAction(qState, stateKey, actions, { epsilon = DEFAULT_EPSILON } = {}, rng = Math.random) {
  const values = getQValues(qState, stateKey);
  if (rng() < epsilon) {
    return actions[Math.floor(rng() * actions.length)];
  }
  let best = actions[0];
  let bestValue = -Infinity;
  for (const action of actions) {
    const value = values[action] ?? 0;
    if (value > bestValue) {
      bestValue = value;
      best = action;
    }
  }
  return best;
}

/**
 * One-step TD update. `nextStateKey` of null/undefined marks a terminal
 * transition (the encounter ended -- hostile died, fled successfully, or
 * FruitFly died), so there's no future value to bootstrap from.
 */
export function updateQ(qState, stateKey, action, reward, nextStateKey, { alpha = DEFAULT_ALPHA, gamma = DEFAULT_GAMMA } = {}) {
  const values = getQValues(qState, stateKey);
  let nextMax = 0;
  if (nextStateKey) {
    const nextValues = getQValues(qState, nextStateKey);
    nextMax = Math.max(nextValues.FIGHT ?? 0, nextValues.FLEE ?? 0);
  }
  const current = values[action] ?? 0;
  values[action] = current + alpha * (reward + gamma * nextMax - current);
  return values[action];
}

export function qValue(qState, stateKey, action) {
  return getQValues(qState, stateKey)[action] ?? 0;
}

export const defaultQState = createQState();
