import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, id, className = '', ...props }: InputProps) {
  return (
    <div className="input-group">
      {label && (
        <label htmlFor={id} className="input-group__label">
          {label}
        </label>
      )}
      <input
        {...props}
        id={id}
        className={`input-group__field ${error ? 'input-group__field--error' : ''} ${className}`}
      />
      {error && <p className="input-group__error">{error}</p>}
    </div>
  );
}
