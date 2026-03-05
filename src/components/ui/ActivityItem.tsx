import React from 'react';

interface ActivityItemProps {
  time: string;
  title: string;
  desc: string;
}

export const ActivityItem: React.FC<ActivityItemProps> = ({ time, title, desc }) => {
  return (
    <div className="flex gap-4 items-start">
      <div className="text-xs text-roman-text-sub font-serif italic w-12 pt-1">{time}</div>
      <div className="flex-1 pb-4 border-b border-roman-border/50">
        <div className="font-medium text-roman-text-main">{title}</div>
        <div className="text-sm text-roman-text-sub">{desc}</div>
      </div>
    </div>
  );
};
