import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createQState, chooseAction, updateQ, qValue,
  buildCombatStateKey, healthBucket, classifyHostileCategory,
} from '../src/learning/qlearning.js';

test('healthBucket buckets correctly at the boundaries', () => {
  assert.equal(healthBucket(20), 'high');
  assert.equal(healthBucket(15), 'high');
  assert.equal(healthBucket(14), 'medium');
  assert.equal(healthBucket(8), 'medium');
  assert.equal(healthBucket(7), 'low');
  assert.equal(healthBucket(0), 'low');
});

test('classifyHostileCategory sorts known mobs into hard/medium/easy and unknown for none', () => {
  assert.equal(classifyHostileCategory('creeper'), 'hard');
  assert.equal(classifyHostileCategory('witch'), 'medium');
  assert.equal(classifyHostileCategory('zombie'), 'easy');
  assert.equal(classifyHostileCategory(null), 'unknown');
});

test('buildCombatStateKey produces a stable, distinguishing key', () => {
  const a = buildCombatStateKey({ healthBucket: 'high', toolTier: 'iron', hostileCategory: 'easy' });
  const b = buildCombatStateKey({ healthBucket: 'high', toolTier: 'iron', hostileCategory: 'hard' });
  assert.notEqual(a, b);
  assert.equal(a, buildCombatStateKey({ healthBucket: 'high', toolTier: 'iron', hostileCategory: 'easy' }));
});

test('chooseAction exploits (picks the higher-value action) outside exploration', () => {
  const q = createQState();
  updateQ(q, 'ctx', 'FIGHT', -10, null);
  updateQ(q, 'ctx', 'FLEE', 10, null);
  const action = chooseAction(q, 'ctx', ['FIGHT', 'FLEE'], undefined, () => 0.99); // never explores
  assert.equal(action, 'FLEE');
});

test('chooseAction ties resolve to the first candidate (fresh state defaults to 0/0)', () => {
  const q = createQState();
  const action = chooseAction(q, 'unseen', ['FIGHT', 'FLEE'], undefined, () => 0.99);
  assert.equal(action, 'FIGHT');
});

test('chooseAction explores when rng falls under epsilon', () => {
  const q = createQState();
  updateQ(q, 'ctx', 'FIGHT', 10, null); // FIGHT looks strictly better
  updateQ(q, 'ctx', 'FLEE', -10, null);
  const calls = [0.0, 0.99]; // first call triggers explore, second picks index 1 -> FLEE
  const rng = () => calls.shift();
  const action = chooseAction(q, 'ctx', ['FIGHT', 'FLEE'], undefined, rng);
  assert.equal(action, 'FLEE');
});

test('updateQ applies the standard TD(0) Bellman update', () => {
  const q = createQState();
  // Q(s,a) <- 0 + alpha * (reward + gamma * maxQ(s') - 0)
  const alpha = 0.5;
  const gamma = 0.9;
  updateQ(q, 'next', 'FIGHT', 0, null, { alpha, gamma }); // seed next-state FIGHT to 0 (already default)
  updateQ(q, 'next', 'FLEE', 4, null, { alpha, gamma }); // next-state FLEE value becomes 0.5*4 = 2
  assert.equal(qValue(q, 'next', 'FLEE'), 2);

  const before = qValue(q, 'start', 'FIGHT');
  assert.equal(before, 0);
  const updated = updateQ(q, 'start', 'FIGHT', 1, 'next', { alpha, gamma });
  // expected = 0 + 0.5 * (1 + 0.9 * max(0, 2) - 0) = 0.5 * (1 + 1.8) = 1.4
  assert.ok(Math.abs(updated - 1.4) < 1e-9);
});

test('updateQ treats a null nextStateKey as terminal (no bootstrapped future value)', () => {
  const q = createQState();
  const updated = updateQ(q, 'terminalCtx', 'FLEE', 6, null, { alpha: 0.5, gamma: 0.9 });
  // expected = 0 + 0.5 * (6 + 0.9*0 - 0) = 3
  assert.equal(updated, 3);
});

test('repeated positive reinforcement pulls Q toward the reward (converges, does not overshoot)', () => {
  const q = createQState();
  let value;
  for (let i = 0; i < 50; i++) {
    value = updateQ(q, 'ctx', 'FIGHT', 5, null, { alpha: 0.3, gamma: 0.9 });
  }
  assert.ok(Math.abs(value - 5) < 0.01);
});
