import React, { useState } from 'react';
import { BRAND_LOGO_PATH } from '../data/defaults';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<BrandLogoProps['size']>, string> = {
  sm: 'w-8 h-8 rounded-md',
  md: 'w-10 h-10 rounded-lg',
  lg: 'w-12 h-12 rounded-xl',
};

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 'md', className = '' }) => {
  const [failed, setFailed] = useState(false);

  return (
    <span
      className={`relative inline-flex items-center justify-center overflow-hidden bg-black border border-white/15 shrink-0 select-none ${SIZE_CLASSES[size]} ${className}`}
    >
      {failed ? (
        <span className="font-display font-extrabold text-white text-xs tracking-tight">GZ</span>
      ) : (
        <img
          src={BRAND_LOGO_PATH}
          alt="Gen Z Events logo"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover object-center scale-[1.55]"
        />
      )}
    </span>
  );
};
