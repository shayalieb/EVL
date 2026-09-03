import test from 'node:test';
import assert from 'node:assert/strict';
import { stagePlotNotesToPlainText } from '../../src/lib/stagePlotNotes.js';

test('converts previously saved rich stage-plot notes into readable plain text', () => {
  assert.equal(
    stagePlotNotesToPlainText('<p>DI box &amp; power</p><ul><li>Two wedges</li><li>Vocal mic</li></ul>'),
    'DI box & power\n• Two wedges\n• Vocal mic',
  );
});

test('leaves new multiline plain-text stage-plot notes intact', () => {
  assert.equal(stagePlotNotesToPlainText('Channel 1\nChannel 2'), 'Channel 1\nChannel 2');
});
