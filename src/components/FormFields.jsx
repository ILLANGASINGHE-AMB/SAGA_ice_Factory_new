import React from 'react';

export const Input = React.forwardRef(({
  label,
  name,
  type = 'text',
  error,
  required = false,
  className = '',
  ...props
}, ref) => {
  return (
    <div className={`w-full flex flex-col space-y-1.5 ${className}`}>
      {label && (
        <label htmlFor={name} className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-wider">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <input
        ref={ref}
        id={name}
        name={name}
        type={type}
        className={`w-full px-3.5 py-3 text-xs sm:text-sm bg-white dark:bg-slate-900 border ${
          error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-slate-300 dark:border-slate-800 focus:ring-navy-500 focus:border-navy-500'
        } rounded-xl text-slate-900 dark:text-slate-100 shadow-xs focus:outline-none focus:ring-2 focus:ring-opacity-50 transition min-h-[44px]`}
        {...props}
      />
      {error && (
        <p className="text-xs text-red-500 mt-0.5 font-medium">{error.message || error}</p>
      )}
    </div>
  );
});

export const Select = React.forwardRef(({
  label,
  name,
  options = [], // Array of { value, label }
  error,
  required = false,
  className = '',
  ...props
}, ref) => {
  return (
    <div className={`w-full flex flex-col space-y-1.5 ${className}`}>
      {label && (
        <label htmlFor={name} className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-wider">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <select
        ref={ref}
        id={name}
        name={name}
        className={`w-full px-3.5 py-3 text-xs sm:text-sm bg-white dark:bg-slate-900 border ${
          error ? 'border-red-500 focus:ring-red-500' : 'border-slate-300 dark:border-slate-800 focus:ring-navy-500 focus:border-navy-500'
        } rounded-xl text-slate-900 dark:text-slate-100 shadow-xs focus:outline-none focus:ring-2 focus:ring-opacity-50 transition min-h-[44px]`}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="text-xs text-red-500 mt-0.5 font-medium">{error.message || error}</p>
      )}
    </div>
  );
});

export const TextArea = React.forwardRef(({
  label,
  name,
  error,
  required = false,
  className = '',
  rows = 3,
  ...props
}, ref) => {
  return (
    <div className={`w-full flex flex-col space-y-1.5 ${className}`}>
      {label && (
        <label htmlFor={name} className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-wider">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <textarea
        ref={ref}
        id={name}
        name={name}
        rows={rows}
        className={`w-full px-3.5 py-3 text-xs sm:text-sm bg-white dark:bg-slate-900 border ${
          error ? 'border-red-500 focus:ring-red-500' : 'border-slate-300 dark:border-slate-800 focus:ring-navy-500 focus:border-navy-500'
        } rounded-xl text-slate-900 dark:text-slate-100 shadow-xs focus:outline-none focus:ring-2 focus:ring-opacity-50 transition`}
        {...props}
      />
      {error && (
        <p className="text-xs text-red-500 mt-0.5 font-medium">{error.message || error}</p>
      )}
    </div>
  );
});

