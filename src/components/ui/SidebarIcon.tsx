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
      className={`w-full flex justify-center py-3 cursor-pointer relative transition-colors ${active ? 'text-roman-primary' : 'text-white/40 hover:text-white/80'}`}
    >
      {active && <div className="absolute left-0 top-0 bottom-0 w-1 bg-roman-primary"></div>}
      {icon}
    </button>
  );
}
