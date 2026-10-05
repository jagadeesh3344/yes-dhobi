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
  alt = 'YesDhobi'
}) => {
  return (
    <img
      src="/Screenshot 2026-10-05 090933.png"
      alt={alt}
      onError={(e) => {
        // Fallback to exact extensionless file path uploaded by user if needed
        const target = e.currentTarget;
        if (target.src.endsWith('.png')) {
          target.src = '/Screenshot 2026-10-05 090933';
        }
      }}
      className={`${className} object-contain select-none`}
      style={{
        objectFit: 'contain'
      }}
      draggable={false}
      loading="eager"
    />
  );
};

export default YesDhobiLogo;
