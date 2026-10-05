import React from 'react';

interface YesDhobiLogoProps {
  className?: string;
  variant?: 'navy' | 'white';
  alt?: string;
}

/**
 * YesDhobiLogo
 * Strictly renders the official provided YesDhobi logo image file:
 * "Screenshot 2026-10-05 090933"
 * Preserves exact aspect ratio, typography, colors, and proportions.
 * Uses object-fit: contain (never cover, no crop, no distortion, no mirroring).
 */
export const YesDhobiLogo: React.FC<YesDhobiLogoProps> = ({
  className = 'h-8 sm:h-9 w-auto',
  variant = 'navy',
  alt = 'Yes Dhobi'
}) => {
  const src = variant === 'white'
    ? '/yesdhobi-official-logo-white.png'
    : '/yesdhobi-official-logo-transparent.png';

  return (
    <img
      src={src}
      alt={alt}
      onError={(e) => {
        const target = e.currentTarget;
        if (target.src.includes('yesdhobi-official-logo-transparent')) {
          target.src = '/Screenshot 2026-10-05 090933.png';
        }
      }}
      className={`${className} object-contain select-none`}
      style={{ objectFit: 'contain' }}
      draggable={false}
      loading="eager"
    />
  );
};

export default YesDhobiLogo;
