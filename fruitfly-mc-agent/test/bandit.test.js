import test from 'node:test';
import assert from 'node:assert/strict';
import { createBanditState, selectArm, updateArm, armStats } from '../src/learning/bandit.js';

test('updateArm computes an incremental running average', () => {
  const state = createBanditState();
  updateArm(state, 'ctx', 'a', 10);
  updateArm(state, 'ctx', 'a', 0);
  const stats = armStats(state, 'ctx', 'a');
  assert.equal(stats.count, 2);
  assert.equal(stats.value, 5);
});

test('selectArm greedily prefers the higher-value arm outside exploration', () => {
  const state = createBanditState();
  updateArm(state, 'ctx', 'good', 10);
  updateArm(state, 'ctx', 'bad', -10);
  // rng always returns 0.99 -> never triggers the epsilon-exploration branch
  const rng = () => 0.99;
  const arm = selectArm(state, 'ctx', ['good', 'bad'], rng);
  assert.equal(arm, 'good');
});

test('selectArm explores when rng falls under epsilon', () => {
  const state = createBanditState();
  updateArm(state, 'ctx', 'good', 10);
  updateArm(state, 'ctx', 'bad', -10);
  // first rng() call (0.0) triggers exploration, second call picks index
  const calls = [0.0, 0.99];
  const rng = () => calls.shift();
  const arm = selectArm(state, 'ctx', ['good', 'bad'], rng);
  assert.equal(arm, 'bad'); // floor(0.99 * 2) = 1 -> 'bad'
});

test('selectArm with a single arm always returns it without consuming rng', () => {
  const state = createBanditState();
  const arm = selectArm(state, 'ctx', ['only'], () => {
    throw new Error('rng should not be called for a single-arm context');
  });
  assert.equal(arm, 'only');
});
