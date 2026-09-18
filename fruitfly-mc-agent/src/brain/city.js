import { loadBlueprint } from '../utils/blueprints.js';

// The build order the city cycles through as it expands outward. Houses
// dominate (this is meant to become "a whole city", not one showpiece),
// with farms kept in proportion for food security and occasional
// warehouses/watchtowers for storage and lookout coverage.
const BUILD_CYCLE = ['house', 'farm', 'house', 'warehouse', 'house', 'farm', 'house', 'watchtower'];

const TYPE_TO_BLUEPRINT = {
  house: 'starter_house',
  farm: 'farm_plot',
  warehouse: 'warehouse',
  watchtower: 'watchtower',
};

const PLOT_SPACING = 14; // blocks between plot origins, leaves room for streets

// Decorative/non-blocking materials: a plot can still be marked "resources
// ready" without these on hand, and the executor substitutes or skips them.
const OPTIONAL_MATERIALS = new Set(['glass_pane', 'oak_door']);

/**
 * Deterministic outward square-spiral grid coordinates, so plot N always
 * lands in the same place regardless of when it's planned.
 */
export function spiralCoordinate(index) {
  if (index === 0) return { gx: 0, gz: 0 };
  let x = 0;
  let z = 0;
  let dx = 1;
  let dz = 0;
  let segmentLength = 1;
  let stepsInSegment = 0;
  let segmentsCompleted = 0;
  let i = 0;
  while (i < index) {
    x += dx;
    z += dz;
    i += 1;
    stepsInSegment += 1;
    if (stepsInSegment === segmentLength) {
      stepsInSegment = 0;
      [dx, dz] = [-dz, dx]; // rotate 90 degrees
      segmentsCompleted += 1;
      if (segmentsCompleted % 2 === 0) segmentLength += 1;
    }
  }
  return { gx: x, gz: z };
}

export function createCityState() {
  return { plots: [] };
}

function materialTally(blueprintName) {
  const bp = loadBlueprint(blueprintName);
  const tally = {};
  for (const b of bp.blocks) {
    tally[b.block] = (tally[b.block] || 0) + 1;
  }
  return tally;
}

/**
 * @param {{count:number}} inventory-ish counts map
 */
export function canAfford(inventoryCounts, blueprintName) {
  const tally = materialTally(blueprintName);
  for (const [material, needed] of Object.entries(tally)) {
    if (OPTIONAL_MATERIALS.has(material)) continue;
    const have = inventoryCounts[material] || 0;
    if (have < needed) return false;
  }
  return true;
}

/**
 * Get (and lazily extend) the current city plan: how many plots are
 * finished, and what the next plot to build is with its grid position.
 * Plot 0 is reserved for the starter house built by BUILD_SHELTER, so the
 * city cycle here starts allocating from plot index 1.
 */
export function getCityPlan(cityState, inventoryCounts) {
  if (!cityState.plots || cityState.plots.length === 0) {
    cityState.plots = [{ index: 0, type: 'house', gx: 0, gz: 0, status: 'complete' }];
  }

  let pending = cityState.plots.find((p) => p.status !== 'complete');
  if (!pending) {
    const nextIndex = cityState.plots.length;
    const type = BUILD_CYCLE[(nextIndex - 1) % BUILD_CYCLE.length];
    const { gx, gz } = spiralCoordinate(nextIndex);
    pending = { index: nextIndex, type, gx, gz, status: 'planned' };
    cityState.plots.push(pending);
  }

  const blueprintName = TYPE_TO_BLUEPRINT[pending.type];
  const resourcesReady = inventoryCounts ? canAfford(inventoryCounts, blueprintName) : false;
  const completedCount = cityState.plots.filter((p) => p.status === 'complete').length;

  return {
    completedCount,
    nextPlot: {
      index: pending.index,
      type: pending.type,
      blueprint: blueprintName,
      x: pending.gx * PLOT_SPACING,
      z: pending.gz * PLOT_SPACING,
    },
    resourcesReady,
  };
}

export function markPlotComplete(cityState, plotIndex) {
  const plot = cityState.plots.find((p) => p.index === plotIndex);
  if (plot) plot.status = 'complete';
}

export const constants = { BUILD_CYCLE, PLOT_SPACING, TYPE_TO_BLUEPRINT };
