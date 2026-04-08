import React from 'react';

interface SidebarIconProps {
  icon: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  title?: string;
}

export function SidebarIcon({ icon, active, onClick, title }: SidebarIconProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`group w-full flex flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 cursor-pointer relative transition-colors text-left ${
        active ? 'text-roman-primary bg-white/[0.07] shadow-[inset_0_0_0_1px_rgba(201,167,102,0.24)]' : 'text-white/70 hover:text-white hover:bg-white/[0.06]'
      }`}
    >
      {active && <div className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-roman-primary"></div>}
      <span className="flex h-5 w-5 items-center justify-center flex-shrink-0">{icon}</span>
      {title && (
        <span className="text-[9px] leading-none text-center font-medium tracking-tight truncate max-w-full">{title}</span>
      )}
    </button>
  );
}

