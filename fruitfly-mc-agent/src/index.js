import mineflayerPkg from 'mineflayer';
import pathfinderPkg from 'mineflayer-pathfinder';
import { plugin as collectBlockPlugin } from 'mineflayer-collectblock';
import { plugin as toolPlugin } from 'mineflayer-tool';
import { loader as autoEatLoader } from 'mineflayer-auto-eat';

import { loadConfig } from './config.js';
import { loadMemory, saveMemory, recordDeath, DEFAULT_PATH } from './memory.js';
import { DatasetLogger } from './logger.js';
import { buildAgentState } from './perception.js';
import { decideNextAction } from './brain/stateMachine.js';
import { markPlotComplete } from './brain/city.js';
import { createExecutors } from './executors.js';
import { computeReward } from './learning/reward.js';
import { getTuning, classifyDeathCause, applyDeathLesson } from './learning/lessons.js';
import { updateQ, buildCombatStateKey, healthBucket, classifyHostileCategory } from './learning/qlearning.js';
import * as bandit from './learning/bandit.js';

const { createBot } = mineflayerPkg;
const { pathfinder, Movements } = pathfinderPkg;

const config = loadConfig();
const memory = loadMemory(config.memoryPath || DEFAULT_PATH);
memory.stats.sessionsPlayed += 1;

const logger = new DatasetLogger({ sessionId: config.sessionId });
const executors = createExecutors(bandit);

console.log(`[fruitfly] connecting to ${config.host}:${config.port} as ${config.username} (auth=${config.auth})`);
console.log(`[fruitfly] dataset logging to ${logger.filePath}`);

const bot = createBot({
  host: config.host,
  port: config.port,
  username: config.username,
  auth: config.auth,
  version: config.version,
});

bot.loadPlugin(pathfinder);
bot.loadPlugin(collectBlockPlugin);
bot.loadPlugin(toolPlugin);
bot.loadPlugin(autoEatLoader);

let running = false;
let ticksThisLife = 0;
let saveCounter = 0;
let deathCount = 0;
let lastState = null; // most recent AgentState snapshot, used to infer cause of death
let pendingQUpdate = null; // a Q-learning-driven FIGHT/FLEE awaiting its outcome next tick

function persist() {
  saveMemory(memory, config.memoryPath || DEFAULT_PATH);
}

/**
 * Resolve last tick's Q-learning combat decision now that `state` shows
 * its outcome (one-step TD lookahead: this tick's state is exactly "s'"
 * for the action chosen last tick). Dying between the two ticks is
 * scored as a hard penalty rather than the misleading health jump a
 * respawn would otherwise produce.
 */
function resolvePendingQUpdate(state) {
  const p = pendingQUpdate;
  pendingQUpdate = null;
  if (!p) return;

  if (deathCount > p.deathCountAtDecision) {
    updateQ(memory.qlearning, p.stateKey, p.action, -20, null);
    return;
  }

  const healthDelta = state.health - p.healthBefore;
  const hostileResolved = !state.hostileNearby || state.hostileType !== p.hostileType;
  const reward = healthDelta
    + (hostileResolved && p.action === 'FIGHT' ? 5 : 0)
    + (hostileResolved && p.action === 'FLEE' ? 1 : 0);
  const nextStateKey = hostileResolved
    ? null
    : buildCombatStateKey({
        healthBucket: healthBucket(state.health),
        toolTier: state.toolTier,
        hostileCategory: classifyHostileCategory(state.hostileType),
      });
  updateQ(memory.qlearning, p.stateKey, p.action, reward, nextStateKey);
}

async function tick() {
  if (!running) return;
  ticksThisLife += 1;

  let state;
  let action;
  let result = { success: false };
  let error = null;

  try {
    const tuning = getTuning(memory.lessons);
    state = buildAgentState(bot, memory, tuning);

    // See what happened as a result of last tick's Q-learning combat
    // decision (if any) before making a new one.
    resolvePendingQUpdate(state);

    lastState = state; // snapshot kept for death-cause inference, see bot.on('death')
    const qLearning = { qState: memory.qlearning, rng: Math.random };
    action = decideNextAction(state, tuning, qLearning);
    const executor = executors[action.type] || executors.IDLE;
    result = (await executor(bot, memory, action, state)) || { success: false };

    if (action.type === 'BUILD_CITY_STRUCTURE' && result.plotComplete) {
      markPlotComplete(memory.city, action.params.plot.index);
    }

    if ((action.type === 'FIGHT' || action.type === 'FLEE') && action.params?.qStateKey) {
      pendingQUpdate = {
        stateKey: action.params.qStateKey,
        action: action.type,
        hostileType: action.params.hostileType,
        healthBefore: state.health,
        deathCountAtDecision: deathCount,
      };
    }
  } catch (err) {
    error = err.message;
    console.error('[fruitfly] tick error:', err);
  }

  const reward = computeReward({
    actionSucceeded: result.success,
    milestoneReached: result.milestoneReached,
    cityStructureCompleted: Boolean(result.plotComplete),
    cropsHarvested: result.cropsHarvested || 0,
  });

  if (action) {
    logger.log({
      state: state && {
        health: state.health,
        food: state.food,
        foodItemCount: state.foodItemCount,
        hasWeapon: state.hasWeapon,
        isNight: state.isNight,
        hostileNearby: state.hostileNearby,
        hostileType: state.hostileType,
        toolTier: state.toolTier,
        hasShelter: state.hasShelter,
        hasFarm: state.hasFarm,
        cityCompleted: state.city && state.city.completedCount,
      },
      action: { type: action.type, params: action.params },
      reason: action.reason,
      reward,
    });

    if (action.type === 'BUILD_CITY_STRUCTURE' && action.params?.plot) {
      bandit.updateArm(memory.bandit, 'next_city_blueprint', action.params.plot.type, reward);
    }
  }

  if (error) {
    logger.log({ state, action: { type: 'ERROR' }, reason: error, reward: -1 });
  }

  saveCounter += 1;
  if (saveCounter % 20 === 0) persist();

  setTimeout(tick, config.tickIntervalMs);
}

bot.once('spawn', () => {
  const movements = new Movements(bot, bot.registry);
  movements.canDig = true;
  bot.pathfinder.setMovements(movements);

  bot.autoEat.settings = bot.autoEat.settings || {};
  bot.autoEat.settings.priority = 'foodPoints';
  bot.autoEat.settings.minHunger = 15;

  console.log('[fruitfly] spawned, starting decision loop');
  running = true;
  ticksThisLife = 0;
  tick();
});

bot.on('death', () => {
  // mineflayer's death event carries no cause -- infer it from the last
  // AgentState snapshot taken before it fired, and retune the survival
  // thresholds in stateMachine.js accordingly. This is the actual
  // "learn from its mistakes" mechanism: see src/learning/lessons.js.
  const cause = classifyDeathCause(lastState);
  const hostileType = cause === 'combat' ? lastState?.hostileType : null;
  const changes = applyDeathLesson(memory.lessons, cause, hostileType);
  deathCount += 1; // lets resolvePendingQUpdate tell a real death apart from a respawn's health jump

  console.log(`[fruitfly] died after ${ticksThisLife} ticks this life -- cause: ${cause}`, changes);
  recordDeath(memory, ticksThisLife);

  logger.log({
    state: lastState && {
      health: lastState.health,
      food: lastState.food,
      hostileType: lastState.hostileType,
    },
    action: { type: 'DEATH', params: { cause, hostileType } },
    reason: `died: ${cause}`,
    reward: computeReward({ died: true }),
  });

  ticksThisLife = 0;
  persist();
});

bot.on('kicked', (reason) => console.log('[fruitfly] kicked:', reason));
bot.on('error', (err) => console.error('[fruitfly] connection error:', err.message));

bot.on('end', async () => {
  running = false;
  console.log('[fruitfly] connection ended, saving memory and closing dataset log');
  persist();
  await logger.close();
  process.exit(0);
});

async function shutdown() {
  running = false;
  persist();
  await logger.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
