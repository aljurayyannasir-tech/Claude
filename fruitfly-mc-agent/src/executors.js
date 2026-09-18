import { Vec3 } from 'vec3';
import pkg from 'mineflayer-pathfinder';
import { loadBlueprint } from './utils/blueprints.js';
import { placeBlueprint, placeAt } from './utils/placement.js';
import { recordMilestone } from './memory.js';
import { isFoodItem, RAW_TO_COOKED } from './utils/inventory.js';

const { goals } = pkg;

const FUEL_ITEMS = ['coal', 'charcoal', 'oak_planks', 'spruce_planks', 'birch_planks', 'oak_log'];
const WOOD_TOOL_ITEMS = ['wooden_pickaxe', 'wooden_axe', 'wooden_sword'];
const STONE_TOOL_ITEMS = ['stone_pickaxe', 'stone_axe', 'stone_sword'];
const IRON_TOOL_ITEMS = ['iron_pickaxe', 'iron_axe', 'iron_sword'];

async function goNear(bot, pos, range = 1) {
  bot.pathfinder.setGoal(new goals.GoalNear(pos.x, pos.y, pos.z, range));
  await bot.pathfinder.goto(new goals.GoalNear(pos.x, pos.y, pos.z, range)).catch(() => {});
}

function findGroundOrigin(bot, spreadFrom, footprint) {
  // Best-effort flat spot: use the bot's current feet position, floored.
  // Real terrain leveling is out of scope here (documented limitation);
  // placement.js already tolerates uneven ground by skipping blocks it
  // can't find a solid reference for.
  const base = bot.entity.position.floored();
  return base.offset(spreadFrom.x, 0, spreadFrom.z);
}

// --- Survival -------------------------------------------------------------

async function escapeDanger(bot) {
  const pos = bot.entity.position;
  const away = pos.offset((Math.random() - 0.5) * 6, 1, (Math.random() - 0.5) * 6);
  await goNear(bot, away, 1);
  return { success: true };
}

async function flee(bot, state) {
  const hostile = state.hostileEntity;
  if (!hostile) return { success: false };
  const dir = bot.entity.position.minus(hostile.position).normalize();
  const target = bot.entity.position.plus(dir.scaled(10));
  await goNear(bot, target, 2);
  return { success: true };
}

async function meleeEngage(bot, targetEntity, timeoutMs = 5000) {
  const weapon = bot.inventory.items().find((i) => i.name.endsWith('_sword')) ||
    bot.inventory.items().find((i) => i.name.endsWith('_axe'));
  if (weapon) await bot.equip(weapon, 'hand').catch(() => {});

  const deadline = Date.now() + timeoutMs;
  let lastKnownPos = targetEntity.position.clone();
  let killed = false;
  while (Date.now() < deadline) {
    const target = bot.entities[targetEntity.id];
    if (!target || !target.isValid) {
      killed = true;
      break;
    }
    lastKnownPos = target.position.clone();
    const dist = target.position.distanceTo(bot.entity.position);
    if (dist > 3) {
      await goNear(bot, target.position, 2);
    } else {
      bot.lookAt(target.position.offset(0, target.height || 1, 0), true).catch(() => {});
      bot.attack(target);
      await new Promise((r) => setTimeout(r, 650));
    }
  }
  return { killed, lastKnownPos };
}

async function fight(bot, state) {
  const hostile = state.hostileEntity;
  if (!hostile) return { success: false };
  await meleeEngage(bot, hostile);
  return { success: true };
}

async function hunt(bot, state) {
  const passive = state.passiveEntity;
  if (!passive) return { success: false };
  const { killed, lastKnownPos } = await meleeEngage(bot, passive, 6000);
  if (killed) {
    // Walk over to the drop so mineflayer's automatic item pickup grabs it.
    await goNear(bot, lastKnownPos, 1);
  }
  return { success: true };
}

async function maintainWeapon(bot, memory) {
  // Best weapon it can currently afford, preferring a sword but settling
  // for an axe (also a real weapon in Minecraft) if sword ingredients are
  // short. Tries best material tier down to whatever is craftable.
  const candidates = ['iron_sword', 'stone_sword', 'wooden_sword', 'iron_axe', 'stone_axe', 'wooden_axe'];
  for (const item of candidates) {
    const already = bot.inventory.items().some((i) => i.name === item);
    if (already) return { success: true };
    const res = await craftItem(bot, memory, item);
    if (res.success) return { success: true };
  }
  return { success: false };
}

async function eat(bot) {
  const food = bot.inventory.items().find((i) => isFoodItem(i.name));
  if (!food) return { success: false };
  try {
    await bot.equip(food, 'hand');
    await bot.consume();
    return { success: true };
  } catch {
    return { success: false };
  }
}

async function seekShelter(bot, memory) {
  const shelter = memory.buildings && memory.buildings.shelter;
  if (!shelter) return { success: false };
  const origin = new Vec3(shelter.origin.x, shelter.origin.y, shelter.origin.z);
  await goNear(bot, origin.offset(2, 1, 2), 1);
  return { success: true };
}

async function sleep(bot, memory) {
  const shelter = memory.buildings && memory.buildings.shelter;
  const bedPos = shelter && shelter.bedPos;
  if (bedPos) {
    try {
      const bedBlock = bot.blockAt(new Vec3(bedPos.x, bedPos.y, bedPos.z));
      if (bedBlock) {
        await bot.sleep(bedBlock);
        return { success: true };
      }
    } catch {
      /* fall through to waiting it out */
    }
  }
  // No bed placed yet: hole up and wait for sunrise rather than wandering
  // into the dark.
  await new Promise((r) => setTimeout(r, 4000));
  return { success: true };
}

// --- Gathering / crafting ---------------------------------------------------

async function collectMatching(bot, predicate, count = 6) {
  const ids = Object.values(bot.registry.blocks)
    .filter((b) => predicate(b.name))
    .map((b) => b.id);
  if (ids.length === 0) return { success: false };
  const blocks = bot.findBlocks({ matching: ids, maxDistance: 48, count });
  if (blocks.length === 0) return { success: false };
  const targets = blocks.map((pos) => bot.blockAt(pos)).filter(Boolean);
  try {
    await bot.collectBlock.collect(targets, { ignoreNoPath: true });
    return { success: true };
  } catch {
    return { success: false };
  }
}

async function gatherWood(bot) {
  return collectMatching(bot, (name) => name.endsWith('_log'));
}

async function gatherStone(bot) {
  return collectMatching(bot, (name) => name === 'stone' || name === 'cobblestone');
}

async function mineOre(bot, oreName) {
  return collectMatching(bot, (name) => name === oreName || name === `deepslate_${oreName}`, 3);
}

async function craftItem(bot, memory, itemName) {
  const itemDef = bot.registry.itemsByName[itemName];
  if (!itemDef) return { success: false };

  let tableBlock = null;
  const craftingTable = memory.buildings && memory.buildings.craftingTable;
  if (craftingTable) {
    const pos = new Vec3(craftingTable.origin.x, craftingTable.origin.y, craftingTable.origin.z);
    await goNear(bot, pos, 2);
    tableBlock = bot.blockAt(pos);
  }

  const recipes = bot.recipesFor(itemDef.id, null, 1, tableBlock);
  if (!recipes || recipes.length === 0) return { success: false };
  try {
    await bot.craft(recipes[0], 1, tableBlock || undefined);
    return { success: true };
  } catch {
    return { success: false };
  }
}

async function craftSequence(bot, memory, items) {
  let any = false;
  for (const item of items) {
    const has = bot.inventory.items().some((i) => i.name === item);
    if (has) continue;
    const res = await craftItem(bot, memory, item);
    any = any || res.success;
  }
  return { success: any };
}

async function craft(bot, memory, itemName) {
  if (itemName === 'crafting_table') {
    // Craft the table item, then place it right next to the bot and
    // remember where, so future crafts/smelts can path back to it.
    const res = await craftItem(bot, memory, 'crafting_table');
    if (!res.success) return res;
    const placePos = bot.entity.position.floored().offset(1, 0, 0);
    const placed = await placeAt(bot, placePos, 'crafting_table');
    if (placed) {
      memory.buildings = memory.buildings || {};
      memory.buildings.craftingTable = { origin: { x: placePos.x, y: placePos.y, z: placePos.z } };
      recordMilestone(memory, 'crafting_table');
    }
    return { success: placed, milestoneReached: placed ? 'crafting_table' : null };
  }

  if (itemName === 'furnace') {
    const res = await craftItem(bot, memory, 'furnace');
    if (!res.success) return res;
    const placePos = bot.entity.position.floored().offset(-1, 0, 0);
    const placed = await placeAt(bot, placePos, 'furnace');
    if (placed) {
      memory.buildings = memory.buildings || {};
      memory.buildings.furnace = { origin: { x: placePos.x, y: placePos.y, z: placePos.z } };
      recordMilestone(memory, 'furnace');
    }
    return { success: placed, milestoneReached: placed ? 'furnace' : null };
  }

  if (itemName === 'wooden_tools') {
    const res = await craftSequence(bot, memory, WOOD_TOOL_ITEMS);
    if (res.success) recordMilestone(memory, 'wood_tools');
    return { success: res.success, milestoneReached: res.success ? 'wood_tools' : null };
  }

  if (itemName === 'stone_tools') {
    const res = await craftSequence(bot, memory, STONE_TOOL_ITEMS);
    if (res.success) recordMilestone(memory, 'stone_tools');
    return { success: res.success, milestoneReached: res.success ? 'stone_tools' : null };
  }

  if (itemName === 'iron_tools') {
    const res = await craftSequence(bot, memory, IRON_TOOL_ITEMS);
    if (res.success) recordMilestone(memory, 'iron_tools');
    return { success: res.success, milestoneReached: res.success ? 'iron_tools' : null };
  }

  return craftItem(bot, memory, itemName);
}

async function useFurnace(bot, memory, inputPredicate) {
  const furnace = memory.buildings && memory.buildings.furnace;
  if (!furnace) return { success: false };
  const pos = new Vec3(furnace.origin.x, furnace.origin.y, furnace.origin.z);
  await goNear(bot, pos, 2);
  const block = bot.blockAt(pos);
  if (!block) return { success: false };

  try {
    const furnaceWindow = await bot.openFurnace(block);
    const fuel = bot.inventory.items().find((i) => FUEL_ITEMS.includes(i.name));
    const input = bot.inventory.items().find((i) => inputPredicate(i.name));
    if (!input) {
      furnaceWindow.close();
      return { success: false };
    }
    if (fuel) await furnaceWindow.putFuel(fuel.type, null, Math.min(fuel.count, 8));
    await furnaceWindow.putInput(input.type, null, input.count);
    await new Promise((r) => setTimeout(r, 10000)); // smelting/cooking takes real furnace time
    const output = furnaceWindow.outputItem();
    if (output) await furnaceWindow.takeOutput();
    furnaceWindow.close();
    return { success: true };
  } catch {
    return { success: false };
  }
}

async function smelt(bot, memory) {
  return useFurnace(bot, memory, (name) => name.endsWith('_ore'));
}

async function cook(bot, memory) {
  return useFurnace(bot, memory, (name) => Object.prototype.hasOwnProperty.call(RAW_TO_COOKED, name));
}

// --- Building ---------------------------------------------------------------

async function buildShelter(bot, memory, emergency) {
  if (emergency) {
    // Panic shelter: wall the bot in with whatever solid blocks it's
    // carrying so it survives the immediate night, without committing to
    // a permanent structure location.
    const pos = bot.entity.position.floored();
    const solid = bot.inventory.items().find((i) => bot.registry.blocksByName[i.name]);
    if (!solid) return { success: false };
    const offsets = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]];
    let placed = 0;
    for (const [dx, dy, dz] of offsets) {
      const ok = await placeAt(bot, pos.offset(dx, dy, dz), solid.name);
      if (ok) placed += 1;
    }
    return { success: placed > 0 };
  }

  const bp = loadBlueprint('starter_house');
  const origin = findGroundOrigin(bot, { x: 2, z: 2 }, bp);
  const { placed, failed } = await placeBlueprint(bot, bp, origin);
  if (placed > 0) {
    memory.buildings = memory.buildings || {};
    memory.buildings.shelter = { origin: { x: origin.x, y: origin.y, z: origin.z } };
    recordMilestone(memory, 'shelter');
  }
  return { success: placed > 0, milestoneReached: placed > 0 ? 'shelter' : null, blocksPlaced: placed, blocksFailed: failed };
}

async function buildFarm(bot, memory) {
  const bp = loadBlueprint('farm_plot');
  const shelter = memory.buildings && memory.buildings.shelter;
  const anchor = shelter
    ? new Vec3(shelter.origin.x, shelter.origin.y, shelter.origin.z).offset(8, 0, 0)
    : bot.entity.position.floored().offset(4, 0, 0);

  const hoe = bot.inventory.items().find((i) => i.name.endsWith('_hoe'));
  const bucket = bot.inventory.items().find((i) => i.name === 'water_bucket');
  const seeds = bot.inventory.items().find((i) => i.name === 'wheat_seeds');

  let tilled = 0;
  const groundLayer = bp.blocks.filter((b) => b.dy === 0);
  for (const cell of groundLayer) {
    const targetPos = anchor.offset(cell.dx, 0, cell.dz);
    await goNear(bot, targetPos, 3);
    const block = bot.blockAt(targetPos);
    if (!block) continue;
    try {
      if (cell.block === 'water') {
        if (bucket) {
          await bot.equip(bucket, 'hand');
          await bot.activateBlock(block);
        }
      } else if (hoe && (block.name === 'dirt' || block.name === 'grass_block')) {
        await bot.equip(hoe, 'hand');
        await bot.activateBlock(block);
        tilled += 1;
      }
    } catch {
      /* best-effort: skip this cell and keep going */
    }
  }

  if (tilled > 0) {
    memory.buildings = memory.buildings || {};
    memory.buildings.farm = { origin: { x: anchor.x, y: anchor.y, z: anchor.z } };
    recordMilestone(memory, 'farm');
  }

  if (seeds) await plantCrops(bot, memory);
  return { success: tilled > 0, milestoneReached: tilled > 0 ? 'farm' : null };
}

async function plantCrops(bot, memory) {
  const farm = memory.buildings && memory.buildings.farm;
  if (!farm) return { success: false };
  const bp = loadBlueprint('farm_plot');
  const origin = new Vec3(farm.origin.x, farm.origin.y, farm.origin.z);
  const seeds = bot.inventory.items().find((i) => i.name === 'wheat_seeds');
  if (!seeds) return { success: false };

  let planted = 0;
  for (const cell of bp.blocks.filter((b) => b.block === 'wheat')) {
    const pos = origin.offset(cell.dx, 0, cell.dz); // farmland is at y0, plant on top
    const below = bot.blockAt(pos);
    const at = bot.blockAt(pos.offset(0, 1, 0));
    if (!below || below.name !== 'farmland') continue;
    if (at && at.name !== 'air') continue;
    try {
      await bot.equip(seeds, 'hand');
      await bot.activateBlock(below);
      planted += 1;
    } catch {
      /* skip cell */
    }
  }
  return { success: planted > 0 };
}

async function harvestCrops(bot, memory) {
  const farm = memory.buildings && memory.buildings.farm;
  if (!farm) return { success: false };
  const bp = loadBlueprint('farm_plot');
  const origin = new Vec3(farm.origin.x, farm.origin.y, farm.origin.z);

  let harvested = 0;
  for (const cell of bp.blocks.filter((b) => b.block === 'wheat')) {
    const pos = origin.offset(cell.dx, 1, cell.dz);
    const block = bot.blockAt(pos);
    if (!block || block.name !== 'wheat') continue;
    try {
      const props = typeof block.getProperties === 'function' ? block.getProperties() : {};
      const mature = Number(props.age ?? block.metadata) >= 7;
      if (!mature) continue;
      await goNear(bot, pos, 2);
      await bot.dig(block);
      harvested += 1;
    } catch {
      /* skip cell */
    }
  }
  if (harvested > 0) await plantCrops(bot, memory);
  return { success: harvested > 0, cropsHarvested: harvested };
}

async function buildCityStructure(bot, memory, plot) {
  const bp = loadBlueprint(plot.blueprint);
  const shelter = memory.buildings && memory.buildings.shelter;
  const base = shelter
    ? new Vec3(shelter.origin.x, shelter.origin.y, shelter.origin.z)
    : bot.entity.position.floored();
  const origin = base.offset(plot.x, 0, plot.z);

  if (plot.type === 'farm') {
    memory.buildings = memory.buildings || {};
    const before = memory.buildings.farm;
    memory.buildings.farm = { origin: { x: origin.x, y: origin.y, z: origin.z } };
    const res = await buildFarm(bot, memory);
    if (!res.success) memory.buildings.farm = before;
    return { ...res, plotComplete: res.success };
  }

  const { placed, failed } = await placeBlueprint(bot, bp, origin);
  const complete = placed > bp.blocks.length * 0.6; // tolerate some unreachable/blocked cells
  return { success: placed > 0, plotComplete: complete, blocksPlaced: placed, blocksFailed: failed };
}

async function explore(bot, memory, bandit) {
  const { selectArm, updateArm } = bandit;
  const direction = selectArm(memory.bandit, 'explore_direction', ['n', 's', 'e', 'w']);
  const vectors = { n: [0, 0, -1], s: [0, 0, 1], e: [1, 0, 0], w: [-1, 0, 0] };
  const [dx, , dz] = vectors[direction];
  const target = bot.entity.position.offset(dx * 24, 0, dz * 24);
  await goNear(bot, target, 3);
  updateArm(memory.bandit, 'explore_direction', direction, 0.5);
  return { success: true };
}

export function createExecutors(bandit) {
  return {
    ESCAPE_DANGER: (bot) => escapeDanger(bot),
    FLEE: (bot, memory, action, state) => flee(bot, state),
    FIGHT: (bot, memory, action, state) => fight(bot, state),
    HUNT: (bot, memory, action, state) => hunt(bot, state),
    EAT: (bot) => eat(bot),
    COOK: (bot, memory) => cook(bot, memory),
    MAINTAIN_WEAPON: (bot, memory) => maintainWeapon(bot, memory),
    SEEK_SHELTER: (bot, memory) => seekShelter(bot, memory),
    SLEEP: (bot, memory) => sleep(bot, memory),
    GATHER_WOOD: (bot) => gatherWood(bot),
    GATHER_STONE: (bot) => gatherStone(bot),
    MINE_ORE: (bot, memory, action) => mineOre(bot, action.params.ore.replace('_ore', '')),
    CRAFT: (bot, memory, action) => craft(bot, memory, action.params.item),
    SMELT: (bot, memory) => smelt(bot, memory),
    BUILD_SHELTER: (bot, memory, action) => buildShelter(bot, memory, action.params?.emergency),
    BUILD_FARM: (bot, memory) => buildFarm(bot, memory),
    PLANT_CROPS: (bot, memory) => plantCrops(bot, memory),
    HARVEST_CROPS: (bot, memory) => harvestCrops(bot, memory),
    BUILD_CITY_STRUCTURE: (bot, memory, action) => buildCityStructure(bot, memory, action.params.plot),
    EXPLORE: (bot, memory) => explore(bot, memory, bandit),
    IDLE: async () => ({ success: true }),
  };
}
