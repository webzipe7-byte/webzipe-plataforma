import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

type FieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: (id: string, describedBy?: string) => ReactNode;
  className?: string;
};

export function Field({ label, hint, error, required, children, className = '' }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={`field ${error ? 'has-error' : ''} ${className}`}>
      <label htmlFor={id} className="field-label">
        {label}
        {required && <span className="field-required" aria-hidden="true"> *</span>}
      </label>
      {children(id, [hintId, errorId].filter(Boolean).join(' ') || undefined)}
      {hint && !error && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type Common = { label: ReactNode; hint?: ReactNode; error?: string | null; fieldClassName?: string };

export function TextField({ label, hint, error, required, fieldClassName, ...rest }: Common & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={fieldClassName}>
      {(id, describedBy) => <input id={id} className="input" aria-describedby={describedBy} aria-invalid={!!error} required={required} {...rest} />}
    </Field>
  );
}

export function TextArea({ label, hint, error, required, fieldClassName, ...rest }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={fieldClassName}>
      {(id, describedBy) => <textarea id={id} className="input textarea" aria-describedby={describedBy} aria-invalid={!!error} required={required} {...rest} />}
    </Field>
  );
}

export function SelectField({
  label,
  hint,
  error,
  required,
  fieldClassName,
  options,
  placeholder,
  ...rest
}: Common & SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={fieldClassName}>
      {(id, describedBy) => (
        <select id={id} className="input select" aria-describedby={describedBy} aria-invalid={!!error} required={required} {...rest}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

/** Select compacto para barras de filtros (sin etiqueta visible). */
export function FilterSelect({
  label,
  options,
  value,
  onChange,
  allLabel = 'Todos',
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  allLabel?: string | null;
}) {
  return (
    <select className="input select input-sm" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {allLabel !== null && <option value="">{allLabel}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
