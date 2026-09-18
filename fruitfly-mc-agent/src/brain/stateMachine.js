// Pure decision logic: (world state, tuning) -> next action.
// Deliberately has NO dependency on mineflayer so it can be unit tested
// without a live server/connection, and so the "what should I do" logic
// stays auditable and separate from "how do I do it" (see executors.js).
//
// `tuning` is where learning from past mistakes actually changes behavior
// (see src/learning/lessons.js): thresholds here start at sane defaults
// and get retuned after real deaths, persisted across restarts. This
// keeps survival logic deterministic and auditable while still letting it
// adapt -- there is no black box here, just numbers that move based on
// what killed the agent before.

import { defaultTuning } from '../learning/lessons.js';

/**
 * @typedef {Object} AgentState
 * @property {number} health 0-20
 * @property {number} food 0-20
 * @property {boolean} onFire
 * @property {boolean} inLavaOrDanger
 * @property {boolean} isNight
 * @property {boolean} hostileNearby
 * @property {number} closestHostileDistance
 * @property {?string} hostileType mob name, e.g. 'zombie', 'creeper'
 * @property {boolean} hasWeapon
 * @property {boolean} hasFoodItem
 * @property {number} foodItemCount total units of food carried
 * @property {boolean} passiveNearby a huntable passive mob (cow/pig/chicken/sheep) is in range
 * @property {string} toolTier 'none'|'wood'|'stone'|'iron'
 * @property {boolean} hasCraftingTable
 * @property {boolean} hasFurnace
 * @property {boolean} hasShelter
 * @property {boolean} isInsideShelter
 * @property {boolean} hasFarm
 * @property {boolean} farmNeedsReplant
 * @property {boolean} farmReadyToHarvest
 * @property {Object} inventory counts keyed by item name
 * @property {{ nextPlot: ?{type:string, x:number, z:number}, resourcesReady: boolean }} city
 */

const CRAFT_WOOD_TOOLS_PLANKS_NEEDED = 5; // pickaxe(3)+axe(3)+sword(2)-ish overlap, rough gate
const STONE_TOOLS_COBBLE_NEEDED = 11; // pickaxe/axe/sword/furnace-ish gate
const IRON_TOOLS_INGOT_NEEDED = 6;
const EMERGENCY_HUNGER_THRESHOLD = 6; // starvation damage territory, always act regardless of tuning

/**
 * @param {AgentState} s
 * @param {ReturnType<import('../learning/lessons.js').getTuning>} tuning
 * @returns {{type: string, params?: Object, reason: string}}
 */
export function decideNextAction(s, tuning = defaultTuning) {
  // 1. Immediate survival-threatening danger overrides everything.
  if (s.onFire || s.inLavaOrDanger) {
    return { type: 'ESCAPE_DANGER', reason: 'on fire or in immediate environmental danger' };
  }

  // 2. Combat / flee logic. A mob type that has killed FruitFly enough
  // times before (tuning.hostileAvoid, learned from past deaths) is
  // always fled from, even at full health with a weapon in hand.
  if (s.hostileNearby) {
    const learnedAvoid = s.hostileType && tuning.hostileAvoid.has(s.hostileType);
    const critical = s.health <= tuning.fleeHealthThreshold;
    if (critical || !s.hasWeapon || learnedAvoid) {
      const reason = learnedAvoid
        ? `learned to avoid ${s.hostileType} after past losses`
        : critical
          ? 'health at or below learned flee threshold, fleeing hostile'
          : 'unarmed, fleeing hostile';
      return { type: 'FLEE', reason };
    }
    return { type: 'FIGHT', reason: 'armed and healthy, engaging nearby hostile' };
  }

  // 3. Emergency hunger: starvation damage territory, non-negotiable.
  if (s.food <= EMERGENCY_HUNGER_THRESHOLD) {
    if (s.hasFoodItem) {
      return { type: 'EAT', reason: 'critically hungry and food available' };
    }
    if (s.hasFarm && s.farmReadyToHarvest) {
      return { type: 'HARVEST_CROPS', reason: 'critically hungry, harvesting ready farm' };
    }
    if (s.passiveNearby) {
      return { type: 'HUNT', reason: 'critically hungry, hunting nearby animal' };
    }
  }

  // 4. Ordinary hunger (learned buffer, see tuning.foodBufferThreshold).
  if (s.food <= tuning.foodBufferThreshold && s.hasFoodItem) {
    return { type: 'EAT', reason: 'hungry and food available' };
  }

  // 5. Night safety.
  if (s.isNight && !s.hasShelter) {
    return { type: 'BUILD_SHELTER', params: { emergency: true }, reason: 'nightfall with no shelter, building emergency shelter' };
  }
  if (s.isNight && s.hasShelter && !s.isInsideShelter) {
    return { type: 'SEEK_SHELTER', reason: 'nightfall, returning to shelter' };
  }
  if (s.isNight && s.hasShelter && s.isInsideShelter) {
    return { type: 'SLEEP', reason: 'inside shelter at night, sleeping to skip to day' };
  }

  // 6. Always carry a weapon: if tools exist (a crafting table has been
  // used before) but no weapon is on hand -- lost, broken, never crafted
  // one -- fix that before anything else non-urgent.
  if (s.toolTier !== 'none' && !s.hasWeapon) {
    return { type: 'MAINTAIN_WEAPON', reason: 'no weapon on hand, crafting one before continuing' };
  }

  // 7. Cook raw meat when a furnace is available: still edible raw, but
  // cooking is strictly better nutrition for the same inventory slot.
  if (s.hasRawMeat && s.hasFurnace) {
    return { type: 'COOK', reason: 'furnace available, cooking raw meat for better nutrition' };
  }

  // 8. Always carry food: proactively top up the food buffer (learned
  // target, see tuning.stockpileFoodTarget) even when not currently
  // hungry, rather than waiting until hunger forces the issue.
  if (s.foodItemCount < tuning.stockpileFoodTarget) {
    if (s.hasFarm && s.farmReadyToHarvest) {
      return { type: 'HARVEST_CROPS', reason: 'stocking up food reserves from the ready farm' };
    }
    if (s.passiveNearby) {
      return { type: 'HUNT', reason: 'stocking up food reserves by hunting' };
    }
  }

  // 9. Tool / economy progression (daytime, safe).
  const inv = s.inventory || {};

  if (!s.hasCraftingTable) {
    if ((inv.log || 0) + (inv.planks || 0) < 4) {
      return { type: 'GATHER_WOOD', reason: 'need logs before a crafting table' };
    }
    return { type: 'CRAFT', params: { item: 'crafting_table' }, reason: 'have enough wood for a crafting table' };
  }

  if (s.toolTier === 'none') {
    if ((inv.planks || 0) < CRAFT_WOOD_TOOLS_PLANKS_NEEDED) {
      return { type: 'GATHER_WOOD', reason: 'need more planks for wooden tools' };
    }
    return { type: 'CRAFT', params: { item: 'wooden_tools' }, reason: 'crafting starter wooden tools' };
  }

  if (!s.hasShelter) {
    return { type: 'BUILD_SHELTER', params: { emergency: false }, reason: 'building permanent starter house' };
  }

  if (s.toolTier === 'wood') {
    if ((inv.cobblestone || 0) < STONE_TOOLS_COBBLE_NEEDED) {
      return { type: 'GATHER_STONE', reason: 'mining cobblestone for stone tool upgrade' };
    }
    return { type: 'CRAFT', params: { item: 'stone_tools' }, reason: 'crafting stone tool upgrade' };
  }

  if (!s.hasFurnace) {
    if ((inv.cobblestone || 0) < 8) {
      return { type: 'GATHER_STONE', reason: 'need cobblestone for a furnace' };
    }
    return { type: 'CRAFT', params: { item: 'furnace' }, reason: 'crafting a furnace' };
  }

  if (s.toolTier === 'stone') {
    if ((inv.iron_ore || 0) === 0 && (inv.iron_ingot || 0) < IRON_TOOLS_INGOT_NEEDED) {
      return { type: 'MINE_ORE', params: { ore: 'iron_ore' }, reason: 'mining iron ore for tool upgrade' };
    }
    if ((inv.iron_ore || 0) > 0) {
      return { type: 'SMELT', params: { item: 'iron_ingot' }, reason: 'smelting iron ore into ingots' };
    }
    return { type: 'CRAFT', params: { item: 'iron_tools' }, reason: 'crafting iron tool upgrade' };
  }

  // 10. Farming.
  if (!s.hasFarm) {
    return { type: 'BUILD_FARM', reason: 'establishing first farm plot' };
  }
  if (s.farmNeedsReplant) {
    return { type: 'PLANT_CROPS', reason: 'replanting harvested farmland' };
  }
  if (s.farmReadyToHarvest) {
    return { type: 'HARVEST_CROPS', reason: 'crops matured, harvesting' };
  }

  // 11. City expansion once the essentials (tools, shelter, furnace, farm) exist.
  if (s.city && s.city.nextPlot) {
    if (s.city.resourcesReady) {
      return {
        type: 'BUILD_CITY_STRUCTURE',
        params: { plot: s.city.nextPlot },
        reason: `expanding city with a ${s.city.nextPlot.type}`,
      };
    }
    const needsStone = s.city.nextPlot.type === 'watchtower' || s.city.nextPlot.type === 'warehouse';
    return {
      type: needsStone ? 'GATHER_STONE' : 'GATHER_WOOD',
      reason: `gathering resources for next city structure (${s.city.nextPlot.type})`,
    };
  }

  // 12. Nothing urgent: explore to find new resources/terrain for future plots.
  return { type: 'EXPLORE', reason: 'no urgent task, scouting surroundings' };
}

export const constants = {
  CRAFT_WOOD_TOOLS_PLANKS_NEEDED,
  STONE_TOOLS_COBBLE_NEEDED,
  IRON_TOOLS_INGOT_NEEDED,
  EMERGENCY_HUNGER_THRESHOLD,
};
