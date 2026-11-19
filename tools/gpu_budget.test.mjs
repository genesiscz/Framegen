import assert from 'node:assert/strict';
import test from 'node:test';
import { UpscaleWatch, fixedRateShortfall } from '../extension/src/gpu-budget.js';

test('a present cost becomes stale once the upscaler has stopped for 30 presents', () => {
  const w = new UpscaleWatch();
  for (let i = 0; i < 100; i++) assert.equal(w.note(true), false);
  const fired = [];
  for (let i = 1; i <= 100; i++) if (w.note(false)) fired.push(i);
  assert.deepEqual(fired, [30]);
});

test('a Pacer that never saw the upscaler has nothing to forget', () => {
  const w = new UpscaleWatch();
  for (let i = 0; i < 500; i++) assert.equal(w.note(false), false);
});

test('a short gap in upscaling (pipelines compiling for a new size) does not count', () => {
  const w = new UpscaleWatch();
  w.note(true);
  for (let i = 0; i < 29; i++) assert.equal(w.note(false), false);
  assert.equal(w.note(true), false);
  for (let i = 0; i < 29; i++) assert.equal(w.note(false), false);
  assert.equal(w.note(false), true);
});

test('2x that fits the source interval has no shortfall', () => {
  // the 720 rung on this stream: 2x ran at 120 fps
  assert.equal(fixedRateShortfall({ source_interval_ms: 16.67, pair_cost_ms: 5.1, mid_cost_ms: 2.0, present_cost_ms: 0 }), null);
});

test('2x that does not fit reports what it needs', () => {
  // the 1080 rung on the same stream: no frame was generated
  const s = fixedRateShortfall({ source_interval_ms: 16.67, pair_cost_ms: 13.3, mid_cost_ms: 6.6, present_cost_ms: 0 });
  assert.ok(s);
  assert.equal(Math.round(s.need), 20);
  // and the upscaler's cost counts twice, once for each frame shown
  assert.ok(fixedRateShortfall({ source_interval_ms: 16.67, pair_cost_ms: 6.6, mid_cost_ms: 4.3, present_cost_ms: 7.1 }));
});

test('no shortfall before the source rate is known', () => {
  assert.equal(fixedRateShortfall({ source_interval_ms: 0, pair_cost_ms: 50 }), null);
  assert.equal(fixedRateShortfall(null), null);
});
