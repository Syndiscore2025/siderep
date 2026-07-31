import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

import { cn } from '@/utils';

const fieldClasses =
  'w-full rounded-lg border border-edge bg-surface-2 px-3 py-2 text-sm text-content-primary ' +
  'placeholder:text-content-muted transition-colors focus:border-accent focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClasses, 'h-9', className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldClasses, 'resize-none', className)} {...rest} />;
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldClasses, 'h-9 appearance-none', className)} {...rest} />;
}
