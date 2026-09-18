import test from 'node:test';
import assert from 'node:assert/strict';
import { decideNextAction } from '../src/brain/stateMachine.js';
import { createLessonsState, getTuning } from '../src/learning/lessons.js';

function baseState(overrides = {}) {
  return {
    health: 20,
    food: 20,
    onFire: false,
    inLavaOrDanger: false,
    isNight: false,
    hostileNearby: false,
    closestHostileDistance: Infinity,
    hostileType: null,
    passiveNearby: false,
    hasWeapon: true,
    hasFoodItem: false,
    foodItemCount: 10,
    hasRawMeat: false,
    toolTier: 'iron',
    hasCraftingTable: true,
    hasFurnace: true,
    hasShelter: true,
    isInsideShelter: true,
    hasFarm: true,
    farmNeedsReplant: false,
    farmReadyToHarvest: false,
    inventory: {},
    city: { nextPlot: null, resourcesReady: false, completedCount: 0 },
    ...overrides,
  };
}

const tuning = getTuning(createLessonsState());

function decide(overrides = {}, customTuning = tuning) {
  return decideNextAction(baseState(overrides), customTuning);
}

test('immediate danger overrides everything else', () => {
  assert.equal(decide({ onFire: true, health: 3, hostileNearby: true }).type, 'ESCAPE_DANGER');
});

test('flees a hostile when unarmed', () => {
  assert.equal(decide({ hostileNearby: true, hasWeapon: false }).type, 'FLEE');
});

test('flees a hostile when critically low health even if armed', () => {
  assert.equal(decide({ hostileNearby: true, hasWeapon: true, health: 4 }).type, 'FLEE');
});

test('fights a hostile when healthy and armed', () => {
  assert.equal(decide({ hostileNearby: true, hasWeapon: true, health: 20 }).type, 'FIGHT');
});

test('always flees a mob type learned to be dangerous, even healthy and armed', () => {
  const learned = getTuning({
    ...createLessonsState(),
    lossesByHostile: { creeper: 2 },
  });
  const a = decide({ hostileNearby: true, hasWeapon: true, health: 20, hostileType: 'creeper' }, learned);
  assert.equal(a.type, 'FLEE');
  assert.match(a.reason, /learned to avoid creeper/);
});

test('still fights other mob types the learned avoidance does not cover', () => {
  const learned = getTuning({
    ...createLessonsState(),
    lossesByHostile: { creeper: 2 },
  });
  const a = decide({ hostileNearby: true, hasWeapon: true, health: 20, hostileType: 'zombie' }, learned);
  assert.equal(a.type, 'FIGHT');
});

test('a raised flee-health threshold (learned from a past combat death) triggers flight sooner', () => {
  const cautious = getTuning({ ...createLessonsState(), fleeHealthThreshold: 12 });
  const a = decide({ hostileNearby: true, hasWeapon: true, health: 10 }, cautious);
  assert.equal(a.type, 'FLEE');
});

test('eats immediately when critically hungry and food is available', () => {
  assert.equal(decide({ food: 5, hasFoodItem: true }).type, 'EAT');
});

test('harvests for food when critically hungry with no food but a ready farm', () => {
  assert.equal(decide({ food: 5, hasFoodItem: false, farmReadyToHarvest: true }).type, 'HARVEST_CROPS');
});

test('hunts for food when critically hungry with no food but a passive mob nearby', () => {
  assert.equal(decide({ food: 5, hasFoodItem: false, farmReadyToHarvest: false, passiveNearby: true }).type, 'HUNT');
});

test('eats at the learned (not just critical) hunger buffer when food is on hand', () => {
  const wellFed = getTuning({ ...createLessonsState(), foodBufferThreshold: 16 });
  const a = decide({ food: 15, hasFoodItem: true }, wellFed);
  assert.equal(a.type, 'EAT');
});

test('builds emergency shelter at night with none built yet', () => {
  const a = decide({ isNight: true, hasShelter: false });
  assert.equal(a.type, 'BUILD_SHELTER');
  assert.equal(a.params.emergency, true);
});

test('heads back to shelter at night if outside', () => {
  assert.equal(decide({ isNight: true, hasShelter: true, isInsideShelter: false }).type, 'SEEK_SHELTER');
});

test('sleeps at night once inside shelter', () => {
  assert.equal(decide({ isNight: true, hasShelter: true, isInsideShelter: true }).type, 'SLEEP');
});

test('maintains (crafts) a weapon when tools exist but no weapon is on hand', () => {
  const a = decide({ toolTier: 'stone', hasWeapon: false });
  assert.equal(a.type, 'MAINTAIN_WEAPON');
});

test('does not chase a weapon before any tools exist yet (still bootstrapping)', () => {
  const a = decide({ toolTier: 'none', hasWeapon: false, hasCraftingTable: false, inventory: {} });
  assert.equal(a.type, 'GATHER_WOOD');
});

test('cooks raw meat when a furnace is available', () => {
  const a = decide({ hasRawMeat: true, hasFurnace: true });
  assert.equal(a.type, 'COOK');
});

test('proactively stockpiles food below the learned target even when not hungry', () => {
  const a = decide({ food: 20, foodItemCount: 2, farmReadyToHarvest: true });
  assert.equal(a.type, 'HARVEST_CROPS');
  assert.match(a.reason, /stocking up/);
});

test('proactively hunts to stockpile food when no farm is ready but a passive mob is nearby', () => {
  const a = decide({ food: 20, foodItemCount: 2, farmReadyToHarvest: false, passiveNearby: true });
  assert.equal(a.type, 'HUNT');
});

test('gathers wood before a crafting table exists', () => {
  assert.equal(decide({ hasCraftingTable: false, inventory: {} }).type, 'GATHER_WOOD');
});

test('crafts a table once enough wood is on hand', () => {
  const a = decide({ hasCraftingTable: false, inventory: { log: 4 } });
  assert.equal(a.type, 'CRAFT');
  assert.equal(a.params.item, 'crafting_table');
});

test('progresses tool tier: wood -> gather stone -> stone tools', () => {
  const gathering = decide({ toolTier: 'wood', hasShelter: true, inventory: { cobblestone: 2 } });
  assert.equal(gathering.type, 'GATHER_STONE');

  const crafting = decide({ toolTier: 'wood', hasShelter: true, inventory: { cobblestone: 20 } });
  assert.equal(crafting.type, 'CRAFT');
  assert.equal(crafting.params.item, 'stone_tools');
});

test('builds a farm once economy essentials exist', () => {
  assert.equal(decide({ hasFarm: false }).type, 'BUILD_FARM');
});

test('replants before harvesting is irrelevant when both are pending, replant wins', () => {
  assert.equal(decide({ farmNeedsReplant: true, farmReadyToHarvest: true }).type, 'PLANT_CROPS');
});

test('expands the city once everything else is satisfied and resources are ready', () => {
  const a = decide({ city: { nextPlot: { type: 'house', x: 14, z: 0 }, resourcesReady: true, completedCount: 1 } });
  assert.equal(a.type, 'BUILD_CITY_STRUCTURE');
});

test('gathers resources for the next city structure when not ready', () => {
  const a = decide({ city: { nextPlot: { type: 'watchtower', x: 14, z: 14 }, resourcesReady: false, completedCount: 2 } });
  assert.equal(a.type, 'GATHER_STONE');
});

test('falls back to exploring when there is truly nothing to do', () => {
  const a = decide({ city: { nextPlot: null, resourcesReady: false, completedCount: 99 } });
  assert.equal(a.type, 'EXPLORE');
});
