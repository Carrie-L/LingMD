export const DOUBLE_BACKTICK_WINDOW_MS = 400;

export function buildCodeBlockEdit({ text, from, to }) {
  const before = text.slice(0, from);
  const selected = text.slice(from, to);
  const after = text.slice(to);
  const needNewlineBefore = before.length === 0 || before.endsWith('\n') ? '' : '\n';
  const needNewlineAfter = after.length === 0 || after.startsWith('\n') ? '' : '\n';
  const insert = `${needNewlineBefore}\`\`\`\n${selected}\n\`\`\`${needNewlineAfter}`;
  const selectionAnchor = from + needNewlineBefore.length + 4;

  return {
    from,
    to,
    insert,
    selectionAnchor,
    selectionHead: selectionAnchor + selected.length,
  };
}

export function buildDoubleBacktickCodeBlockEdit({
  text,
  selectionFrom,
  selectionTo,
  now,
  lastInlineBacktick,
  thresholdMs = DOUBLE_BACKTICK_WINDOW_MS,
}) {
  if (!lastInlineBacktick) return null;
  if (selectionFrom !== selectionTo) return null;

  const { from, to, insertedAt } = lastInlineBacktick;
  if (![from, to, insertedAt].every(Number.isFinite)) return null;
  if (now - insertedAt > thresholdMs) return null;
  if (selectionFrom !== from + 1) return null;
  if (text.slice(from, to) !== '``') return null;

  const withoutInlinePair = text.slice(0, from) + text.slice(to);
  const codeBlockEdit = buildCodeBlockEdit({
    text: withoutInlinePair,
    from,
    to: from,
  });

  return {
    from,
    to,
    insert: codeBlockEdit.insert,
    selectionAnchor: codeBlockEdit.selectionAnchor,
    selectionHead: codeBlockEdit.selectionHead,
  };
}
