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
      className={`group w-full flex items-center justify-center rounded-xl px-2.5 py-2.5 cursor-pointer relative transition-colors text-left ${
        active ? 'text-roman-primary bg-white/[0.05] shadow-[inset_0_0_0_1px_rgba(201,167,102,0.16)]' : 'text-white/55 hover:text-white hover:bg-white/[0.03]'
      }`}
    >
      {active && <div className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-roman-primary"></div>}
      <span className="flex h-5 w-5 items-center justify-center flex-shrink-0">{icon}</span>
    </button>
  );
}
