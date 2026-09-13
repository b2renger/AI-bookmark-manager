import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

const BASE =
  'w-full rounded-md border border-line-1 bg-surface-1 px-2.5 text-sm text-fg-1 placeholder:text-fg-3 outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Rendered as a visually attached label; already translated by the caller. */
  label?: string;
  leading?: ReactNode;
}

export function Input({ label, leading, className = '', id, ...rest }: InputProps) {
  const field = (
    <div className="relative flex items-center">
      {leading ? (
        <span className="pointer-events-none absolute left-2.5 flex text-fg-3">{leading}</span>
      ) : null}
      <input
        id={id}
        className={`${BASE} h-9 ${leading ? 'pl-8' : ''} ${className}`}
        {...rest}
      />
    </div>
  );
  if (label === undefined) return field;
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-fg-2" htmlFor={id}>
      <span>{label}</span>
      {field}
    </label>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function Textarea({ label, className = '', id, ...rest }: TextareaProps) {
  const field = <textarea id={id} className={`${BASE} py-2 leading-relaxed ${className}`} {...rest} />;
  if (label === undefined) return field;
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-fg-2" htmlFor={id}>
      <span>{label}</span>
      {field}
    </label>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string;
  options: SelectOption[];
}

export function Select({ label, options, className = '', id, ...rest }: SelectProps) {
  const field = (
    <select id={id} className={`${BASE} h-9 pr-6 ${className}`} {...rest}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
  if (label === undefined) return field;
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-fg-2" htmlFor={id}>
      <span>{label}</span>
      {field}
    </label>
  );
}
