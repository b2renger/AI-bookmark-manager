
import React from 'react';

export const Spinner: React.FC<{ className?: string }> = ({ className = "h-5 w-5 border-blue-500" }) => (
  <div
    className={`animate-spin rounded-full border-2 border-t-transparent ${className}`}
    role="status"
    aria-live="polite"
  >
    <span className="sr-only">Loading...</span>
  </div>
);
