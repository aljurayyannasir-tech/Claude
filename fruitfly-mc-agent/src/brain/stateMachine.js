// Pure decision logic: (world state) -> next action.
// Deliberately has NO dependency on mineflayer so it can be unit tested
// without a live server/connection, and so the "what should I do" logic
// stays auditable and separate from "how do I do it" (see executors.js).

/**
 * @typedef {Object} AgentState
 * @property {number} health 0-20
 * @property {number} food 0-20
 * @property {boolean} onFire
 * @property {boolean} inLavaOrDanger
 * @property {boolean} isNight
 * @property {boolean} hostileNearby
 * @property {number} closestHostileDistance
 * @property {boolean} hasWeapon
 * @property {boolean} hasFoodItem
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

/**
 * @param {AgentState} s
 * @returns {{type: string, params?: Object, reason: string}}
 */
export function decideNextAction(s) {
  // 1. Immediate survival-threatening danger overrides everything.
  if (s.onFire || s.inLavaOrDanger) {
    return { type: 'ESCAPE_DANGER', reason: 'on fire or in immediate environmental danger' };
  }

  // 2. Combat / flee logic.
  if (s.hostileNearby) {
    const critical = s.health <= 6;
    if (critical || !s.hasWeapon) {
      return { type: 'FLEE', reason: critical ? 'health critical, fleeing hostile' : 'unarmed, fleeing hostile' };
    }
    return { type: 'FIGHT', reason: 'armed and healthy, engaging nearby hostile' };
  }

  // 3. Hunger management.
  if (s.food <= 14) {
    if (s.hasFoodItem) {
      return { type: 'EAT', reason: 'hungry and food available' };
    }
    if (s.hasFarm && s.farmReadyToHarvest) {
      return { type: 'HARVEST_CROPS', reason: 'hungry, harvesting ready farm' };
    }
  }

  // 4. Night safety.
  if (s.isNight && !s.hasShelter) {
    return { type: 'BUILD_SHELTER', params: { emergency: true }, reason: 'nightfall with no shelter, building emergency shelter' };
  }
  if (s.isNight && s.hasShelter && !s.isInsideShelter) {
    return { type: 'SEEK_SHELTER', reason: 'nightfall, returning to shelter' };
  }
  if (s.isNight && s.hasShelter && s.isInsideShelter) {
    return { type: 'SLEEP', reason: 'inside shelter at night, sleeping to skip to day' };
  }

  // 5. Tool / economy progression (daytime, safe).
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

  // 6. Farming.
  if (!s.hasFarm) {
    return { type: 'BUILD_FARM', reason: 'establishing first farm plot' };
  }
  if (s.farmNeedsReplant) {
    return { type: 'PLANT_CROPS', reason: 'replanting harvested farmland' };
  }
  if (s.farmReadyToHarvest) {
    return { type: 'HARVEST_CROPS', reason: 'crops matured, harvesting' };
  }

  // 7. City expansion once the essentials (tools, shelter, furnace, farm) exist.
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

  // 8. Nothing urgent: explore to find new resources/terrain for future plots.
  return { type: 'EXPLORE', reason: 'no urgent task, scouting surroundings' };
}

export const constants = {
  CRAFT_WOOD_TOOLS_PLANKS_NEEDED,
  STONE_TOOLS_COBBLE_NEEDED,
  IRON_TOOLS_INGOT_NEEDED,
};
