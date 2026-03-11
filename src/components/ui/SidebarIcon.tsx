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
      className={`group w-full flex items-center justify-center px-3 py-3 cursor-pointer relative transition-colors text-left ${
        active ? 'text-roman-primary bg-white/[0.04]' : 'text-white/55 hover:text-white hover:bg-white/[0.03]'
      }`}
    >
      {active && <div className="absolute left-0 top-0 bottom-0 w-1 bg-roman-primary"></div>}
      <span className="flex h-5 w-5 items-center justify-center flex-shrink-0">{icon}</span>
    </button>
  );
}
