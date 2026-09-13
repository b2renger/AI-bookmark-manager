import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FilterBar, type FilterValue } from './FilterBar.js';
import type { TFn } from './types.js';

afterEach(cleanup);

const t: TFn = (key) => key;

const value: FilterValue = { text: '', platform: null, status: null, sort: 'created_desc' };

function setup(onChange: (patch: Partial<FilterValue>) => void, override: Partial<FilterValue> = {}) {
  render(
    <FilterBar
      t={t}
      value={{ ...value, ...override }}
      platformFacets={[
        { key: 'youtube', count: 12 },
        { key: 'github', count: 4 },
      ]}
      statusFacets={[{ key: 'ready', count: 16 }]}
      total={16}
      onChange={onChange}
    />,
  );
}

describe('FilterBar', () => {
  it('emits the search text', () => {
    const onChange = vi.fn();
    setup(onChange);
    fireEvent.change(screen.getByLabelText('filter.search'), { target: { value: 'café' } });
    expect(onChange).toHaveBeenCalledWith({ text: 'café' });
  });

  it('emits a platform pill and toggles it off when already active', () => {
    const onChange = vi.fn();
    setup(onChange);
    fireEvent.click(screen.getByTestId('platform-pill-youtube'));
    expect(onChange).toHaveBeenLastCalledWith({ platform: 'youtube' });
    cleanup();

    const onChange2 = vi.fn();
    setup(onChange2, { platform: 'youtube' });
    fireEvent.click(screen.getByTestId('platform-pill-youtube'));
    expect(onChange2).toHaveBeenLastCalledWith({ platform: null });
  });

  it('emits status and sort changes', () => {
    const onChange = vi.fn();
    setup(onChange);
    fireEvent.change(screen.getByLabelText('filter.status'), { target: { value: 'ready' } });
    expect(onChange).toHaveBeenLastCalledWith({ status: 'ready' });

    fireEvent.change(screen.getByLabelText('filter.sort'), { target: { value: 'title' } });
    expect(onChange).toHaveBeenLastCalledWith({ sort: 'title' });
  });

  it('renders platform counts and a reset that clears every filter', () => {
    const onChange = vi.fn();
    setup(onChange, { text: 'x' });
    expect(screen.getByTestId('platform-pill-youtube').textContent).toContain('filter.platformOption');
    fireEvent.click(screen.getByText('filter.reset'));
    expect(onChange).toHaveBeenLastCalledWith({ text: '', platform: null, status: null });
  });
});
