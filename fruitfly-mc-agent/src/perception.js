import { Vec3 } from 'vec3';
import { loadBlueprint } from './utils/blueprints.js';
import { getCityPlan } from './brain/city.js';
import { inventoryCounts, detectToolTier, hasAnyFood, hasAnyWeapon, isHostile } from './utils/inventory.js';

const HOSTILE_SCAN_RADIUS = 16;
const DANGEROUS_BLOCKS = new Set(['lava', 'flowing_lava', 'fire']);

function nearestHostile(bot) {
  let closest = null;
  let closestDist = Infinity;
  for (const entity of Object.values(bot.entities)) {
    if (!isHostile(entity)) continue;
    const dist = entity.position.distanceTo(bot.entity.position);
    if (dist < closestDist) {
      closestDist = dist;
      closest = entity;
    }
  }
  if (closest && closestDist <= HOSTILE_SCAN_RADIUS) {
    return { entity: closest, distance: closestDist };
  }
  return null;
}

function isInImmediateDanger(bot) {
  const pos = bot.entity.position.floored();
  try {
    const feet = bot.blockAt(pos);
    const below = bot.blockAt(pos.offset(0, -1, 0));
    return [feet, below].some((b) => b && DANGEROUS_BLOCKS.has(b.name));
  } catch {
    return false;
  }
}

function isCropMature(block) {
  if (!block) return false;
  try {
    const props = typeof block.getProperties === 'function' ? block.getProperties() : {};
    if (props && props.age !== undefined) return Number(props.age) >= 7;
  } catch {
    /* fall through to metadata check below */
  }
  return block.metadata === 7;
}

function inspectFarm(bot, memory) {
  const farmBuilding = memory.buildings && memory.buildings.farm;
  if (!farmBuilding) return { hasFarm: false, farmNeedsReplant: false, farmReadyToHarvest: false };

  const bp = loadBlueprint('farm_plot');
  const origin = new Vec3(farmBuilding.origin.x, farmBuilding.origin.y, farmBuilding.origin.z);
  let needsReplant = false;
  let readyToHarvest = false;

  for (const cell of bp.blocks.filter((b) => b.block === 'wheat')) {
    const pos = origin.offset(cell.dx, cell.dy, cell.dz);
    let block;
    try {
      block = bot.blockAt(pos);
    } catch {
      continue;
    }
    if (!block || block.name === 'air') {
      needsReplant = true;
    } else if (block.name === 'wheat' && isCropMature(block)) {
      readyToHarvest = true;
    }
  }

  return { hasFarm: true, farmNeedsReplant: needsReplant, farmReadyToHarvest: readyToHarvest };
}

function isInsideShelter(bot, memory) {
  const shelter = memory.buildings && memory.buildings.shelter;
  if (!shelter) return false;
  const origin = new Vec3(shelter.origin.x, shelter.origin.y, shelter.origin.z);
  const bp = loadBlueprint('starter_house');
  const pos = bot.entity.position;
  const within =
    pos.x >= origin.x - 0.5 && pos.x <= origin.x + bp.width + 0.5 &&
    pos.z >= origin.z - 0.5 && pos.z <= origin.z + bp.depth + 0.5 &&
    pos.y >= origin.y && pos.y <= origin.y + bp.height;
  return within;
}

/**
 * Build the plain-object AgentState consumed by decideNextAction() from
 * live mineflayer bot state + persisted memory (which tracks where
 * buildings actually are, since re-scanning the whole world every tick
 * would be far too slow).
 */
export function buildAgentState(bot, memory) {
  const counts = inventoryCounts(bot);
  const hostile = nearestHostile(bot);
  const farm = inspectFarm(bot, memory);
  const buildings = memory.buildings || {};

  const state = {
    health: bot.health,
    food: bot.food,
    onFire: bot.entity && bot.entity.metadata ? Boolean(bot.entity.onFire) : false,
    inLavaOrDanger: isInImmediateDanger(bot),
    isNight: bot.time ? !bot.time.isDay : false,
    hostileNearby: Boolean(hostile),
    closestHostileDistance: hostile ? hostile.distance : Infinity,
    hostileEntity: hostile ? hostile.entity : null,
    hasWeapon: hasAnyWeapon(counts),
    hasFoodItem: hasAnyFood(counts),
    toolTier: detectToolTier(counts),
    hasCraftingTable: Boolean(buildings.craftingTable),
    hasFurnace: Boolean(buildings.furnace),
    hasShelter: Boolean(buildings.shelter),
    isInsideShelter: isInsideShelter(bot, memory),
    inventory: counts,
    ...farm,
  };

  state.city = getCityPlan(memory.city, counts);

  return state;
}
