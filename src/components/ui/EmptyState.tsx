import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, icon: Icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-in fade-in zoom-in-95 duration-500">
      {Icon && (
        <div className="w-16 h-16 bg-roman-bg rounded-full flex items-center justify-center mb-6 border border-roman-border shadow-sm">
          <Icon size={32} className="text-roman-text-sub/50" />
        </div>
      )}
      <h3 className="font-serif text-xl font-medium text-roman-text-main mb-2">{title}</h3>
      <p className="text-sm text-roman-text-sub max-w-sm mx-auto leading-relaxed mb-8">{description}</p>
      {action}
    </div>
  );
}
