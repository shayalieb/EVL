import test from 'node:test';
import assert from 'node:assert/strict';
import { convertStageUnits, stageDefinition, stagePixelGeometry } from '../../src/lib/canvasEngine/stageGeometry.js';

test('older scenes receive professional stage defaults without mutation', () => {
  const scene = { unit: 'ft', scalePxPerUnit: 20 };
  assert.deepEqual(stageDefinition(scene), {
    width: 40, depth: 24, x: 48, y: 58, shape: 'rectangle', audienceEdge: 'bottom',
    showGrid: true, showCenterLine: true, showSafeArea: true, safeArea: 2,
  });
  assert.equal(scene.stage, undefined);
  assert.equal(stagePixelGeometry(scene).widthPx, 800);
});

test('stage dimensions convert between feet and meters without changing their pixel size', () => {
  const scene = { unit: 'ft', scalePxPerUnit: 20, gridSpacing: 5, stage: { width: 40, depth: 20, safeArea: 2 }, zones: [{ id: 'z1', width: 10, depth: 5 }] };
  const converted = convertStageUnits(scene, 'm');
  assert.equal(converted.unit, 'm');
  assert.equal(converted.stage.width, 12.19);
  assert.equal(converted.stage.depth, 6.1);
  assert.ok(Math.abs(stagePixelGeometry(converted).widthPx - 800) < 1);
  assert.equal(converted.zones[0].width, 3.05);
});
