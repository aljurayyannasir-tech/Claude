import test from 'node:test';
import assert from 'node:assert/strict';
import { decideNextAction } from '../src/brain/stateMachine.js';

function baseState(overrides = {}) {
  return {
    health: 20,
    food: 20,
    onFire: false,
    inLavaOrDanger: false,
    isNight: false,
    hostileNearby: false,
    closestHostileDistance: Infinity,
    hasWeapon: false,
    hasFoodItem: false,
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

test('immediate danger overrides everything else', () => {
  const s = baseState({ onFire: true, health: 3, hostileNearby: true });
  assert.equal(decideNextAction(s).type, 'ESCAPE_DANGER');
});

test('flees a hostile when unarmed', () => {
  const s = baseState({ hostileNearby: true, hasWeapon: false });
  assert.equal(decideNextAction(s).type, 'FLEE');
});

test('flees a hostile when critically low health even if armed', () => {
  const s = baseState({ hostileNearby: true, hasWeapon: true, health: 4 });
  assert.equal(decideNextAction(s).type, 'FLEE');
});

test('fights a hostile when healthy and armed', () => {
  const s = baseState({ hostileNearby: true, hasWeapon: true, health: 20 });
  assert.equal(decideNextAction(s).type, 'FIGHT');
});

test('eats when hungry and food is available', () => {
  const s = baseState({ food: 10, hasFoodItem: true });
  assert.equal(decideNextAction(s).type, 'EAT');
});

test('builds emergency shelter at night with none built yet', () => {
  const s = baseState({ isNight: true, hasShelter: false });
  const a = decideNextAction(s);
  assert.equal(a.type, 'BUILD_SHELTER');
  assert.equal(a.params.emergency, true);
});

test('heads back to shelter at night if outside', () => {
  const s = baseState({ isNight: true, hasShelter: true, isInsideShelter: false });
  assert.equal(decideNextAction(s).type, 'SEEK_SHELTER');
});

test('sleeps at night once inside shelter', () => {
  const s = baseState({ isNight: true, hasShelter: true, isInsideShelter: true });
  assert.equal(decideNextAction(s).type, 'SLEEP');
});

test('gathers wood before a crafting table exists', () => {
  const s = baseState({ hasCraftingTable: false, inventory: {} });
  assert.equal(decideNextAction(s).type, 'GATHER_WOOD');
});

test('crafts a table once enough wood is on hand', () => {
  const s = baseState({ hasCraftingTable: false, inventory: { log: 4 } });
  const a = decideNextAction(s);
  assert.equal(a.type, 'CRAFT');
  assert.equal(a.params.item, 'crafting_table');
});

test('progresses tool tier: wood -> gather stone -> stone tools', () => {
  const gathering = baseState({ toolTier: 'wood', hasShelter: true, inventory: { cobblestone: 2 } });
  assert.equal(decideNextAction(gathering).type, 'GATHER_STONE');

  const crafting = baseState({ toolTier: 'wood', hasShelter: true, inventory: { cobblestone: 20 } });
  const a = decideNextAction(crafting);
  assert.equal(a.type, 'CRAFT');
  assert.equal(a.params.item, 'stone_tools');
});

test('builds a farm once economy essentials exist', () => {
  const s = baseState({ hasFarm: false });
  assert.equal(decideNextAction(s).type, 'BUILD_FARM');
});

test('replants before harvesting is irrelevant when both are pending, replant wins', () => {
  const s = baseState({ farmNeedsReplant: true, farmReadyToHarvest: true });
  assert.equal(decideNextAction(s).type, 'PLANT_CROPS');
});

test('expands the city once everything else is satisfied and resources are ready', () => {
  const s = baseState({ city: { nextPlot: { type: 'house', x: 14, z: 0 }, resourcesReady: true, completedCount: 1 } });
  const a = decideNextAction(s);
  assert.equal(a.type, 'BUILD_CITY_STRUCTURE');
});

test('gathers resources for the next city structure when not ready', () => {
  const s = baseState({ city: { nextPlot: { type: 'watchtower', x: 14, z: 14 }, resourcesReady: false, completedCount: 2 } });
  assert.equal(decideNextAction(s).type, 'GATHER_STONE');
});

test('falls back to exploring when there is truly nothing to do', () => {
  const s = baseState({ city: { nextPlot: null, resourcesReady: false, completedCount: 99 } });
  assert.equal(decideNextAction(s).type, 'EXPLORE');
});
