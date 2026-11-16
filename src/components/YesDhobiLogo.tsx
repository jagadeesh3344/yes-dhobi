import React from 'react';
import logoTransparent from '../assets/images/yesdhobi-official-logo-transparent.png';
import logoWhite from '../assets/images/yesdhobi-official-logo-white.png';
import logoFallback from '../assets/images/Screenshot 2026-10-05 090933.png';

interface YesDhobiLogoProps {
  className?: string;
  variant?: 'navy' | 'white';
  alt?: string;
}

/**
 * YesDhobiLogo
 * Strictly renders the official provided YesDhobi logo image file.
 * Preserves exact aspect ratio, typography, colors, and proportions.
 * Uses object-fit: contain (never cover, no crop, no distortion, no mirroring).
 */
export const YesDhobiLogo: React.FC<YesDhobiLogoProps> = ({
  className = 'h-8 sm:h-9 w-auto',
  variant = 'navy',
  alt = 'Yes Dhobi'
}) => {
  const src = variant === 'white' ? logoWhite : logoTransparent;

  return (
    <img
      src={src}
      alt={alt}
      onError={(e) => {
        const target = e.currentTarget;
        if (target.src !== logoFallback) {
          target.src = logoFallback;
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
