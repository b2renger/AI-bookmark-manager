import { useState } from 'react';
import { AlertCircleIcon, ShieldCheckIcon, SparklesIcon } from './icons/index.js';
import type { TFn } from './types.js';

// Port of the ConfidenceBadge inside legacy/components/BookmarkItem.tsx. The two thresholds are
// props with the legacy defaults; the tooltip body is content_versions.confidence_reason.

export const CONFIDENCE_HIGH = 85;
export const CONFIDENCE_MODERATE = 60;

export type ConfidenceLevel = 'high' | 'moderate' | 'low';

export function confidenceLevel(
  score: number,
  high = CONFIDENCE_HIGH,
  moderate = CONFIDENCE_MODERATE,
): ConfidenceLevel {
  if (score >= high) return 'high';
  if (score >= moderate) return 'moderate';
  return 'low';
}

const TONE: Record<ConfidenceLevel, string> = {
  high: 'border-ok/40 bg-ok/10 text-ok',
  moderate: 'border-warn/40 bg-warn/10 text-warn',
  low: 'border-danger/40 bg-danger/10 text-danger',
};

const BAR: Record<ConfidenceLevel, string> = {
  high: 'bg-ok',
  moderate: 'bg-warn',
  low: 'bg-danger',
};

const ICON: Record<ConfidenceLevel, typeof ShieldCheckIcon> = {
  high: ShieldCheckIcon,
  moderate: SparklesIcon,
  low: AlertCircleIcon,
};

export interface ConfidenceBadgeProps {
  t: TFn;
  score: number | null;
  reason?: string | null;
  high?: number;
  moderate?: number;
}

export function ConfidenceBadge({
  t,
  score,
  reason,
  high = CONFIDENCE_HIGH,
  moderate = CONFIDENCE_MODERATE,
}: ConfidenceBadgeProps) {
  const [open, setOpen] = useState(false);
  if (typeof score !== 'number' || Number.isNaN(score)) return null;

  const level = confidenceLevel(score, high, moderate);
  const Icon = ICON[level];
  const levelLabel = t(`confidence.${level}`);
  const body = reason ?? t(`confidence.defaultReason.${level}`);

  return (
    <span className="relative inline-flex items-center">
      <span
        data-testid="confidence-badge"
        data-level={level}
        role="button"
        tabIndex={0}
        title={t('confidence.title', { level: levelLabel, score })}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className={`inline-flex cursor-default select-none items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${TONE[level]}`}
      >
        <Icon className="h-3.5 w-3.5" />
        <span>{t('confidence.short', { score })}</span>
        <span className="ml-0.5 h-1.5 w-8 overflow-hidden rounded-full bg-fg-3/25">
          <span
            className={`block h-full rounded-full ${BAR[level]}`}
            style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
          />
        </span>
      </span>

      {open ? (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 z-30 mb-2 w-64 -translate-x-1/2 rounded-lg border border-line-2 bg-surface-2 p-3 text-xs text-fg-1 shadow-xl"
        >
          <span className="mb-1 block border-b border-line-1 pb-1 font-semibold">
            {t('confidence.title', { level: levelLabel, score })}
          </span>
          <span className="block leading-relaxed text-fg-2">{body}</span>
        </span>
      ) : null}
    </span>
  );
}
