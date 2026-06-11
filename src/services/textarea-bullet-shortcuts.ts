import type { KeyboardEvent } from 'react';

type BulletShortcutOptions = {
  value: string;
  onValueChange: (nextValue: string) => void;
  logPrefix: string;
};

const BULLET_PREFIX = '- ';
const BULLET_LINE_PATTERN = /^(\s*)([-*•])\s(.*)$/;

const setTextareaCaretPosition = (target: HTMLTextAreaElement, position: number): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.requestAnimationFrame(() => {
    try {
      target.focus();
      target.setSelectionRange(position, position);
    } catch (error) {
      console.log('[textarea-bullets] Unable to restore caret position after shortcut.', {
        error,
        position,
      });
    }
  });
};

const getLineBounds = (value: string, cursorPosition: number): { lineStart: number; lineEnd: number } => {
  const boundedPosition = Math.max(0, Math.min(cursorPosition, value.length));
  const lineStart = value.lastIndexOf('\n', boundedPosition - 1) + 1;
  const nextLineBreak = value.indexOf('\n', boundedPosition);
  const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
  return { lineStart, lineEnd };
};

const isBulletInsertShortcut = (event: KeyboardEvent<HTMLTextAreaElement>): boolean =>
  (event.ctrlKey || event.metaKey)
  && event.shiftKey
  && (event.key === '8' || event.code === 'Digit8');

export const handleTextareaBulletShortcuts = (
  event: KeyboardEvent<HTMLTextAreaElement>,
  options: BulletShortcutOptions,
): void => {
  const { value, onValueChange, logPrefix } = options;
  const target = event.currentTarget;
  const selectionStart = target.selectionStart ?? value.length;
  const selectionEnd = target.selectionEnd ?? selectionStart;

  if (isBulletInsertShortcut(event)) {
    event.preventDefault();
    const nextValue = value.slice(0, selectionStart) + BULLET_PREFIX + value.slice(selectionEnd);
    const nextCursorPosition = selectionStart + BULLET_PREFIX.length;
    onValueChange(nextValue);
    setTextareaCaretPosition(target, nextCursorPosition);
    console.log(`[${logPrefix}] Applied bullet shortcut insert in expanded audience field.`, {
      selectionStart,
      selectionEnd,
      nextCursorPosition,
    });
    return;
  }

  if (
    event.key !== 'Enter'
    || event.shiftKey
    || event.altKey
    || event.ctrlKey
    || event.metaKey
    || selectionStart !== selectionEnd
  ) {
    return;
  }

  const { lineStart, lineEnd } = getLineBounds(value, selectionStart);
  const currentLine = value.slice(lineStart, lineEnd);
  const bulletMatch = currentLine.match(BULLET_LINE_PATTERN);
  if (!bulletMatch) {
    return;
  }

  event.preventDefault();
  const [, indent, , content] = bulletMatch;

  if (!content.trim()) {
    const replacement = indent;
    const nextValue = value.slice(0, lineStart) + replacement + value.slice(lineEnd);
    const nextCursorPosition = lineStart + replacement.length;
    onValueChange(nextValue);
    setTextareaCaretPosition(target, nextCursorPosition);
    console.log(`[${logPrefix}] Exited bullet list on empty bullet line in expanded audience field.`, {
      lineStart,
      lineEnd,
      nextCursorPosition,
    });
    return;
  }

  const insertValue = `\n${indent}${BULLET_PREFIX}`;
  const nextValue = value.slice(0, selectionStart) + insertValue + value.slice(selectionEnd);
  const nextCursorPosition = selectionStart + insertValue.length;
  onValueChange(nextValue);
  setTextareaCaretPosition(target, nextCursorPosition);
  console.log(`[${logPrefix}] Continued bullet list with Enter in expanded audience field.`, {
    lineStart,
    lineEnd,
    nextCursorPosition,
  });
};
