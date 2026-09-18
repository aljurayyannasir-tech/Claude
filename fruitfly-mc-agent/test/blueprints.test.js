import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBlueprint, listBlueprintNames } from '../src/utils/blueprints.js';

test('every registered blueprint loads and expands to non-air blocks', () => {
  for (const name of listBlueprintNames()) {
    const bp = loadBlueprint(name);
    assert.ok(bp.blocks.length > 0, `${name} produced no blocks`);
    for (const cell of bp.blocks) {
      assert.notEqual(cell.block, 'air');
      assert.ok(cell.dx >= 0 && cell.dx < bp.width, `${name} dx out of range`);
      assert.ok(cell.dz >= 0 && cell.dz < bp.depth, `${name} dz out of range`);
      assert.ok(cell.dy >= 0 && cell.dy < bp.height, `${name} dy out of range`);
    }
  }
});

test('starter_house has exactly one door cell', () => {
  const bp = loadBlueprint('starter_house');
  const doors = bp.blocks.filter((b) => b.block === 'oak_door');
  assert.equal(doors.length, 1);
});

test('farm_plot has one water source and the rest farmland/wheat', () => {
  const bp = loadBlueprint('farm_plot');
  const water = bp.blocks.filter((b) => b.block === 'water');
  assert.equal(water.length, 1);
  const wheat = bp.blocks.filter((b) => b.block === 'wheat');
  assert.equal(wheat.length, 48); // 7x7 minus the one water tile
});

test('blueprint loader caches repeated loads (same object reference)', () => {
  const first = loadBlueprint('watchtower');
  const second = loadBlueprint('watchtower');
  assert.equal(first, second);
});
