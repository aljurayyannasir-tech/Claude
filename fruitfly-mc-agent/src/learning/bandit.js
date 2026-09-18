// A small epsilon-greedy multi-armed bandit used ONLY for non-critical
// strategic choices (e.g. "which direction to explore", "which city
// blueprint to build next"). Survival-critical decisions in stateMachine.js
// are deliberately deterministic and never routed through this — an
// under-trained bandit should never be the thing deciding whether to flee
// a zombie.
//
// State is a plain JSON-serializable object so it can be persisted via
// memory.js and carried across bot restarts: this is what "learns while it
// plays" means concretely here — accumulated (context, arm) -> value
// estimates that bias future choices, incrementally, run over run.

const DEFAULT_EPSILON = 0.15;

export function createBanditState() {
  return { arms: {} };
}

function key(context, arm) {
  return `${context}::${arm}`;
}

/**
 * Pick an arm for a context using epsilon-greedy selection.
 * @param {ReturnType<typeof createBanditState>} state
 * @param {string} context bucket name, e.g. 'explore_direction' or 'next_city_blueprint'
 * @param {string[]} arms candidate options
 * @param {() => number} [rng] injectable RNG for deterministic tests
 */
export function selectArm(state, context, arms, rng = Math.random) {
  if (!arms || arms.length === 0) {
    throw new Error('selectArm requires at least one candidate arm');
  }
  if (arms.length === 1) return arms[0];

  const explore = rng() < DEFAULT_EPSILON;
  if (explore) {
    return arms[Math.floor(rng() * arms.length)];
  }

  let best = arms[0];
  let bestValue = -Infinity;
  for (const arm of arms) {
    const rec = state.arms[key(context, arm)];
    const value = rec ? rec.value : 0;
    if (value > bestValue) {
      bestValue = value;
      best = arm;
    }
  }
  return best;
}

/**
 * Update the running value estimate for a (context, arm) pair with an
 * observed reward using incremental sample averaging.
 */
export function updateArm(state, context, arm, reward) {
  const k = key(context, arm);
  const rec = state.arms[k] || { count: 0, value: 0 };
  rec.count += 1;
  rec.value += (reward - rec.value) / rec.count;
  state.arms[k] = rec;
  return rec;
}

export function armStats(state, context, arm) {
  return state.arms[key(context, arm)] || { count: 0, value: 0 };
}
