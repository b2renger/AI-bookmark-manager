// Port of legacy/components/common/Spinner.tsx. No baked-in English: the caller passes an
// already-translated label, and without one the spinner is purely decorative.
export interface SpinnerProps {
  className?: string;
  label?: string;
}

export function Spinner({ className = 'h-5 w-5', label }: SpinnerProps) {
  return (
    <div
      role="status"
      {...(label === undefined ? { 'aria-hidden': true } : { 'aria-label': label })}
      className={`${className} animate-spin rounded-full border-2 border-current border-t-transparent`}
    />
  );
}
