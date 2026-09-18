import test from 'node:test';
import assert from 'node:assert/strict';
import { createCityState, getCityPlan, markPlotComplete, spiralCoordinate } from '../src/brain/city.js';

test('spiralCoordinate is deterministic and starts at the origin', () => {
  assert.deepEqual(spiralCoordinate(0), { gx: 0, gz: 0 });
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    const { gx, gz } = spiralCoordinate(i);
    const key = `${gx},${gz}`;
    assert.equal(seen.has(key), false, `duplicate spiral coordinate at index ${i}`);
    seen.add(key);
  }
});

test('getCityPlan seeds plot 0 as the already-complete starter house', () => {
  const city = createCityState();
  const plan = getCityPlan(city, {});
  assert.equal(plan.completedCount, 1);
  assert.equal(plan.nextPlot.index, 1);
});

test('resourcesReady reflects whether inventory can afford the next blueprint', () => {
  const city = createCityState();
  const withNothing = getCityPlan(city, {});
  assert.equal(withNothing.resourcesReady, false);
});

test('markPlotComplete advances the plan to the following plot', () => {
  const city = createCityState();
  const first = getCityPlan(city, {});
  markPlotComplete(city, first.nextPlot.index);
  const second = getCityPlan(city, {});
  assert.equal(second.completedCount, 2);
  assert.notEqual(second.nextPlot.index, first.nextPlot.index);
});

test('plan calls stay stable (no duplicate plot creation) across repeated reads', () => {
  const city = createCityState();
  const a = getCityPlan(city, {});
  const b = getCityPlan(city, {});
  assert.equal(a.nextPlot.index, b.nextPlot.index);
  assert.equal(city.plots.length, 2); // starter house + one pending plot
});
