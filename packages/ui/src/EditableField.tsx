import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, Ref } from 'react';

// Port of the EditableField inside legacy/components/BookmarkItem.tsx. Same API, except that
// `onCommit` now dispatches a library:applyOps op instead of setState, and it only fires when
// the value actually changed (one op per real edit).

export interface EditableFieldProps {
  value: string;
  onCommit: (next: string) => void;
  /** Textarea instead of input; Enter inserts a newline, Ctrl/⌘+Enter commits. */
  multiline?: boolean;
  /** Already translated by the caller. */
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  rows?: number;
}

export function EditableField({
  value,
  onCommit,
  multiline = false,
  placeholder = '',
  ariaLabel,
  disabled = false,
  className = '',
  rows = 3,
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  // Escape must restore the value as it was when editing started, not the latest prop.
  const committedRef = useRef(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);

  const commit = (): void => {
    setEditing(false);
    if (draft !== committedRef.current) onCommit(draft);
  };

  const cancel = (): void => {
    setDraft(committedRef.current);
    setEditing(false);
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
      return;
    }
    if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commit();
    }
  };

  const start = (): void => {
    if (disabled) return;
    committedRef.current = value;
    setDraft(value);
    setEditing(true);
  };

  const shared = {
    value: draft,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown,
    ...(ariaLabel === undefined ? {} : { 'aria-label': ariaLabel }),
    className:
      'w-full rounded-md border border-accent bg-surface-1 px-2 py-1 text-sm text-fg-1 outline-none',
  };

  if (editing) {
    return multiline ? (
      <textarea ref={ref as Ref<HTMLTextAreaElement>} rows={rows} {...shared} />
    ) : (
      <input ref={ref as Ref<HTMLInputElement>} type="text" {...shared} />
    );
  }

  return (
    <span
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={start}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          start();
        }
      }}
      {...(ariaLabel === undefined ? {} : { 'aria-label': ariaLabel })}
      className={`-m-1 inline-block min-w-[3rem] rounded-md p-1 transition-colors ${
        disabled ? '' : 'cursor-text hover:bg-surface-2'
      } ${value ? '' : 'italic text-fg-3'} ${className}`}
    >
      {value || placeholder}
    </span>
  );
}
