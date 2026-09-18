import test from 'node:test';
import assert from 'node:assert/strict';
import { createLessonsState, classifyDeathCause, applyDeathLesson, getTuning } from '../src/learning/lessons.js';

test('classifyDeathCause identifies environmental hazard first', () => {
  assert.equal(classifyDeathCause({ inLavaOrDanger: true, food: 20, hostileNearby: true, health: 20 }), 'environmental_hazard');
  assert.equal(classifyDeathCause({ onFire: true, food: 20, hostileNearby: false, health: 20 }), 'environmental_hazard');
});

test('classifyDeathCause identifies starvation', () => {
  assert.equal(classifyDeathCause({ food: 1, hostileNearby: false, health: 20 }), 'starvation');
});

test('classifyDeathCause identifies combat', () => {
  assert.equal(classifyDeathCause({ food: 20, hostileNearby: true, health: 20 }), 'combat');
});

test('classifyDeathCause falls back to unknown_low_health / unknown', () => {
  assert.equal(classifyDeathCause({ food: 20, hostileNearby: false, health: 5 }), 'unknown_low_health');
  assert.equal(classifyDeathCause({ food: 20, hostileNearby: false, health: 20 }), 'unknown');
  assert.equal(classifyDeathCause(null), 'unknown');
});

test('a starvation death raises the food buffer and stockpile target', () => {
  const lessons = createLessonsState();
  const before = getTuning(lessons);
  applyDeathLesson(lessons, 'starvation');
  const after = getTuning(lessons);
  assert.ok(after.foodBufferThreshold > before.foodBufferThreshold);
  assert.ok(after.stockpileFoodTarget > before.stockpileFoodTarget);
  assert.equal(lessons.deathsByCause.starvation, 1);
});

test('a combat death raises the flee-health threshold', () => {
  const lessons = createLessonsState();
  const before = getTuning(lessons);
  applyDeathLesson(lessons, 'combat', 'zombie');
  const after = getTuning(lessons);
  assert.ok(after.fleeHealthThreshold > before.fleeHealthThreshold);
});

test('repeated combat losses to the same mob type eventually mark it as avoid', () => {
  const lessons = createLessonsState();
  applyDeathLesson(lessons, 'combat', 'creeper');
  assert.equal(getTuning(lessons).hostileAvoid.has('creeper'), false); // one loss is not enough yet
  applyDeathLesson(lessons, 'combat', 'creeper');
  assert.equal(getTuning(lessons).hostileAvoid.has('creeper'), true); // two losses triggers avoidance
});

test('an environmental hazard death raises hazard caution', () => {
  const lessons = createLessonsState();
  applyDeathLesson(lessons, 'environmental_hazard');
  assert.equal(getTuning(lessons).hazardCaution, 1);
});

test('thresholds are capped and do not grow without bound', () => {
  const lessons = createLessonsState();
  for (let i = 0; i < 20; i++) applyDeathLesson(lessons, 'starvation');
  const tuning = getTuning(lessons);
  assert.ok(tuning.foodBufferThreshold <= 18);
  assert.ok(tuning.stockpileFoodTarget <= 12);
});
