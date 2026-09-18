import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createBanditState } from './learning/bandit.js';
import { createCityState } from './brain/city.js';
import { createLessonsState } from './learning/lessons.js';

const DEFAULT_PATH = path.join(process.cwd(), 'data', 'memory.json');

function freshMemory() {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    bandit: createBanditState(),
    city: createCityState(),
    lessons: createLessonsState(),
    stats: {
      sessionsPlayed: 0,
      totalDeaths: 0,
      bestSurvivalTicks: 0,
      totalTicksLived: 0,
      milestonesReached: {}, // e.g. { wood_tools: 3, stone_tools: 2, iron_tools: 1 }
    },
  };
}

export function loadMemory(filePath = DEFAULT_PATH) {
  if (!existsSync(filePath)) {
    return freshMemory();
  }
  try {
    const raw = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    // Defensive merge so older/partial memory files don't crash a newer build.
    const base = freshMemory();
    return {
      ...base,
      ...parsed,
      bandit: parsed.bandit || base.bandit,
      city: parsed.city || base.city,
      lessons: { ...base.lessons, ...(parsed.lessons || {}) },
      stats: { ...base.stats, ...(parsed.stats || {}) },
    };
  } catch (err) {
    console.error(`[memory] failed to parse ${filePath}, starting fresh:`, err.message);
    return freshMemory();
  }
}

export function saveMemory(memory, filePath = DEFAULT_PATH) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(memory, null, 2), 'utf8');
}

export function recordMilestone(memory, name) {
  memory.stats.milestonesReached[name] = (memory.stats.milestonesReached[name] || 0) + 1;
}

export function recordDeath(memory, ticksLived) {
  memory.stats.totalDeaths += 1;
  memory.stats.totalTicksLived += ticksLived;
  if (ticksLived > memory.stats.bestSurvivalTicks) {
    memory.stats.bestSurvivalTicks = ticksLived;
  }
}

export { DEFAULT_PATH };
