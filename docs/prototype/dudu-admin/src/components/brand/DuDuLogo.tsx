import React from 'react';

interface DuDuLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showBadge?: boolean;
}

export const DuDuLogo: React.FC<DuDuLogoProps> = ({ size = 'md', showBadge = true }) => {
  const iconSizes = {
    sm: 'w-7 h-7 text-sm',
    md: 'w-8 h-8 text-base',
    lg: 'w-10 h-10 text-lg',
  };

  const textSizes = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-xl',
  };

  return (
    <div className="flex items-center gap-2.5 select-none">
      {/* 珊瑚橙 D 形气泡图标 */}
      <div
        className={`${iconSizes[size]} bg-[#F2785C] rounded-lg rounded-bl-xs flex items-center justify-center font-bold text-white shadow-xs shrink-0 tracking-tight`}
        style={{
          boxShadow: '0 2px 8px -2px rgba(242, 120, 92, 0.4)',
        }}
      >
        <span className="font-sans font-black leading-none">D</span>
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className={`${textSizes[size]} font-bold tracking-tight text-slate-900 font-sans`}>
          DuDu
        </span>
        {showBadge && (
          <span className="text-[11px] font-semibold text-[#F2785C] tracking-wide uppercase font-sans">
            Admin
          </span>
        )}
      </div>
    </div>
  );
};
