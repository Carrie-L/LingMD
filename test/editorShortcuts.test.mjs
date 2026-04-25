import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DOUBLE_BACKTICK_WINDOW_MS,
  buildCodeBlockEdit,
  buildDoubleBacktickCodeBlockEdit,
} from '../src/editorShortcuts.mjs';

test('buildCodeBlockEdit inserts an empty fenced block into an empty document', () => {
  const edit = buildCodeBlockEdit({ text: '', from: 0, to: 0 });

  assert.deepEqual(edit, {
    from: 0,
    to: 0,
    insert: '```\n\n```',
    selectionAnchor: 4,
    selectionHead: 4,
  });
});

test('buildCodeBlockEdit adds surrounding newlines when inserting inside a paragraph', () => {
  const edit = buildCodeBlockEdit({ text: 'hello world', from: 5, to: 5 });

  assert.equal(edit.insert, '\n```\n\n```\n');
  assert.equal(edit.selectionAnchor, 10);
  assert.equal(edit.selectionHead, 10);
});

test('buildDoubleBacktickCodeBlockEdit expands a fresh inline backtick pair into a fenced block', () => {
  const edit = buildDoubleBacktickCodeBlockEdit({
    text: '``',
    selectionFrom: 1,
    selectionTo: 1,
    now: 1_000,
    lastInlineBacktick: {
      from: 0,
      to: 2,
      insertedAt: 1_000 - DOUBLE_BACKTICK_WINDOW_MS + 50,
    },
  });

  assert.deepEqual(edit, {
    from: 0,
    to: 2,
    insert: '```\n\n```',
    selectionAnchor: 4,
    selectionHead: 4,
  });
});

test('buildDoubleBacktickCodeBlockEdit ignores stale timing and cursor drift', () => {
  assert.equal(
    buildDoubleBacktickCodeBlockEdit({
      text: '``',
      selectionFrom: 1,
      selectionTo: 1,
      now: 1_000,
      lastInlineBacktick: { from: 0, to: 2, insertedAt: 1_000 - DOUBLE_BACKTICK_WINDOW_MS - 1 },
    }),
    null,
  );

  assert.equal(
    buildDoubleBacktickCodeBlockEdit({
      text: '``',
      selectionFrom: 2,
      selectionTo: 2,
      now: 1_000,
      lastInlineBacktick: { from: 0, to: 2, insertedAt: 900 },
    }),
    null,
  );
});
