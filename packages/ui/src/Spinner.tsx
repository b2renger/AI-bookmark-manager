// Port of legacy/components/common/Spinner.tsx.
export function Spinner({ className = 'h-5 w-5', label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className={`${className} animate-spin rounded-full border-2 border-current border-t-transparent`}
    />
  );
}
