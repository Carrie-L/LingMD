import test from 'node:test';
import assert from 'node:assert/strict';

import { getToolbarLeadingActions } from '../src/fileToolbarActions.mjs';

test('toolbar keeps file menu first and adds new button immediately after it', () => {
  const actions = getToolbarLeadingActions();

  assert.deepEqual(
    actions.map((action) => action.id),
    ['file-menu', 'new-file'],
  );
  assert.equal(actions[1].label, '新建');
});
