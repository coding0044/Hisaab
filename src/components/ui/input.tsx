import React from 'react';
import { cn } from '../../lib/utils.ts';

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5',
      className
    )}
    {...props}
  />
));
Label.displayName = 'Label';

const baseControlClasses =
  'w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 dark:focus:border-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(baseControlClasses, 'min-h-[42px]', className)} {...props} />
));
Input.displayName = 'Input';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(baseControlClasses, 'min-h-[42px]', className)} {...props}>
    {children}
  </select>
));
Select.displayName = 'Select';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(baseControlClasses, 'min-h-[88px]', className)} {...props} />
));
Textarea.displayName = 'Textarea';
