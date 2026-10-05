import React from 'react';

interface YesDhobiLogoProps {
  className?: string;
  variant?: 'navy' | 'white';
  alt?: string;
}

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
      className={`object-contain select-none ${className}`}
    />
  );
};

export default YesDhobiLogo;
