const test = require('node:test');
const assert = require('node:assert/strict');

const { getFileMenuItems } = require('../main/fileMenuCommands');

test('file menu keeps new at the top and exposes save-as before export actions', () => {
  const items = getFileMenuItems();
  const separatorIndex = items.findIndex((item) => item.type === 'separator');
  const saveAsIndex = items.findIndex((item) => item.command === 'save-as');

  assert.equal(items[0].command, 'new');
  assert.notEqual(saveAsIndex, -1);
  assert.ok(saveAsIndex < separatorIndex);
});
