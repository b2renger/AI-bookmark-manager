import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BookmarkTable } from './BookmarkTable.js';
import type { BookmarkRow, TFn } from './types.js';

afterEach(cleanup);

const t: TFn = (key) => key;

function makeRows(n: number): BookmarkRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `id-${i}`,
    url: `https://example.com/${i}`,
    title: `Row ${i}`,
    summary: null,
    platform: null,
    status: 'ready',
    starred: false,
    confidence: 90,
    confidenceReason: null,
    author: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tags: [],
  }));
}

const noop = (): void => {};

// happy-dom has no layout, so the scroll viewport measures 0 px; the table takes an explicit
// height for that case (a real browser measures it).
const VIEWPORT = 640;

describe('BookmarkTable', () => {
  it('renders only a window of rows for 10k items', () => {
    const rows = makeRows(10_000);
    render(
      <BookmarkTable
        t={t}
        rows={rows}
        total={rows.length}
        selectedIds={new Set()}
        onToggle={noop}
        onSelectAllVisible={noop}
        onOpen={noop}
        viewportHeight={VIEWPORT}
      />,
    );

    const rendered = screen.getAllByTestId('bookmark-row');
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThan(100);
    // the spacer still reserves the full scroll height: 10 000 × 64 px
    const spacer = screen.getByTestId('bookmark-table').querySelector<HTMLElement>('div[style]');
    expect(spacer?.style.height).toBe('640000px');
  });

  it('calls onOpen on a row click and onToggle from the checkbox without opening', () => {
    const onOpen = vi.fn();
    const onToggle = vi.fn();
    const rows = makeRows(5);
    render(
      <BookmarkTable
        t={t}
        rows={rows}
        total={5}
        selectedIds={new Set()}
        onToggle={onToggle}
        onSelectAllVisible={noop}
        onOpen={onOpen}
        viewportHeight={VIEWPORT}
      />,
    );

    const first = screen.getAllByTestId('bookmark-row')[0]!;
    fireEvent.click(first);
    expect(onOpen).toHaveBeenCalledWith('id-0');

    const checkbox = first.querySelector('input[type="checkbox"]')!;
    fireEvent.click(checkbox);
    expect(onToggle).toHaveBeenCalledWith('id-0');
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('keeps a sticky header and reflects the select-all flag', () => {
    const onSelectAllVisible = vi.fn();
    render(
      <BookmarkTable
        t={t}
        rows={makeRows(3)}
        total={3}
        selectedIds={new Set(['id-0', 'id-1', 'id-2'])}
        allSelected
        onToggle={noop}
        onSelectAllVisible={onSelectAllVisible}
        onOpen={noop}
        viewportHeight={VIEWPORT}
      />,
    );

    const header = screen.getByLabelText('table.selectAllVisible') as HTMLInputElement;
    expect(header.checked).toBe(true);
    expect(header.closest('[role="row"]')?.className).toContain('sticky');
    fireEvent.click(header);
    expect(onSelectAllVisible).toHaveBeenCalled();
  });
});
