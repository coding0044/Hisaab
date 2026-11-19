import { useState } from 'react';
import { cn } from '../../lib/utils.ts';

interface MemberAvatarProps {
  name: string;
  avatarUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

const sizeClasses = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
};

export function MemberAvatar({
  name,
  avatarUrl,
  size = 'md',
  className,
}: MemberAvatarProps) {
  const [failed, setFailed] = useState(false);

  if (!avatarUrl || failed) {
    return (
      <div
        aria-label={name}
        className={cn(
          'inline-flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-display font-semibold text-slate-700 dark:text-slate-200 shrink-0',
          sizeClasses[size],
          className
        )}
      >
        {getInitials(name)}
      </div>
    );
  }

  return (
    <img
      src={avatarUrl}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn(
        'rounded-lg object-cover object-[50%_28%] border border-slate-200 dark:border-slate-700 shrink-0 bg-slate-100 dark:bg-slate-800',
        sizeClasses[size],
        className
      )}
    />
  );
}
