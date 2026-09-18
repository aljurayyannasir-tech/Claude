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

function persist() {
  saveMemory(memory, config.memoryPath || DEFAULT_PATH);
}

async function tick() {
  if (!running) return;
  ticksThisLife += 1;

  let state;
  let action;
  let result = { success: false };
  let error = null;

  try {
    state = buildAgentState(bot, memory);
    action = decideNextAction(state);
    const executor = executors[action.type] || executors.IDLE;
    result = (await executor(bot, memory, action, state)) || { success: false };

    if (action.type === 'BUILD_CITY_STRUCTURE' && result.plotComplete) {
      markPlotComplete(memory.city, action.params.plot.index);
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
        isNight: state.isNight,
        hostileNearby: state.hostileNearby,
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
  console.log(`[fruitfly] died after ${ticksThisLife} ticks this life`);
  recordDeath(memory, ticksThisLife);
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
