import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConfidenceBadge, confidenceLevel } from './ConfidenceBadge.js';
import type { TFn } from './types.js';

afterEach(cleanup);

const t: TFn = (key, opts) => (opts ? `${key}:${JSON.stringify(opts)}` : key);

describe('confidenceLevel', () => {
  it('uses the legacy 85 / 60 thresholds', () => {
    expect(confidenceLevel(100)).toBe('high');
    expect(confidenceLevel(85)).toBe('high');
    expect(confidenceLevel(84)).toBe('moderate');
    expect(confidenceLevel(60)).toBe('moderate');
    expect(confidenceLevel(59)).toBe('low');
    expect(confidenceLevel(0)).toBe('low');
  });

  it('honours custom thresholds', () => {
    expect(confidenceLevel(70, 70, 40)).toBe('high');
    expect(confidenceLevel(50, 70, 40)).toBe('moderate');
    expect(confidenceLevel(39, 70, 40)).toBe('low');
  });
});

describe('ConfidenceBadge', () => {
  it('renders nothing without a score', () => {
    const { container } = render(<ConfidenceBadge t={t} score={null} />);
    expect(container.firstChild).toBeNull();
  });

  it.each([
    [92, 'high'],
    [72, 'moderate'],
    [12, 'low'],
  ])('marks %i as %s', (score, level) => {
    render(<ConfidenceBadge t={t} score={score} />);
    expect(screen.getByTestId('confidence-badge').getAttribute('data-level')).toBe(level);
  });

  it('shows the stored reason in the tooltip', () => {
    render(<ConfidenceBadge t={t} score={90} reason="from oEmbed metadata" />);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(screen.getByTestId('confidence-badge'));
    expect(screen.getByRole('tooltip').textContent).toContain('from oEmbed metadata');
  });

  it('falls back to a translated reason when none is stored', () => {
    render(<ConfidenceBadge t={t} score={30} />);
    fireEvent.mouseEnter(screen.getByTestId('confidence-badge'));
    expect(screen.getByRole('tooltip').textContent).toContain('confidence.defaultReason.low');
  });
});
