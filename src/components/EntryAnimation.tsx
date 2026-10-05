import React, { useEffect, useState } from 'react';
import { YesDhobiLogo } from './YesDhobiLogo';

interface EntryAnimationProps {
  onComplete?: () => void;
}

const SESSION_STORAGE_KEY = 'yesdhobi_has_seen_entry_animation';

export const EntryAnimation: React.FC<EntryAnimationProps> = ({ onComplete }) => {
  const [stage, setStage] = useState<'hidden' | 'appear' | 'hold' | 'exit' | 'done'>('hidden');

  useEffect(() => {
    // Step 1: Initial screen with clean background
    const timerAppear = setTimeout(() => {
      // Step 2: Logo appears (opacity 0 -> 1, scale 0.96 -> 1 over 600ms ease-out)
      setStage('appear');
    }, 50);

    // Step 3 & 4: Brand moment hold with subtle tagline
    const timerHold = setTimeout(() => {
      setStage('hold');
    }, 700);

    // Step 5: Transition into website (fade out after ~1.4s total)
    const timerExit = setTimeout(() => {
      setStage('exit');
    }, 1400);

    // Complete transition into the application at ~1.8s
    const timerDone = setTimeout(() => {
      setStage('done');
      onComplete?.();
    }, 1800);

    return () => {
      clearTimeout(timerAppear);
      clearTimeout(timerHold);
      clearTimeout(timerExit);
      clearTimeout(timerDone);
    };
  }, [onComplete]);

  if (stage === 'done') {
    return null;
  }

  const isVisible = stage === 'appear' || stage === 'hold';
  const isExiting = stage === 'exit';

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-white transition-opacity duration-400 ease-in-out ${
        isExiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      aria-hidden="true"
    >
      <div className="flex flex-col items-center justify-center px-6 max-w-sm sm:max-w-md w-full text-center">
        {/* Step 2 & 3: Original YesDhobi Logo Image - scaling as a single object without letter animation */}
        <div
          className="transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] transform"
          style={{
            opacity: isVisible || isExiting ? 1 : 0,
            transform: isVisible || isExiting ? 'scale(1)' : 'scale(0.96)'
          }}
        >
          <YesDhobiLogo
            className="w-56 sm:w-72 md:w-80 h-auto max-h-24 mx-auto"
            alt="YesDhobi"
          />
        </div>

        {/* Step 4: Subtle brand tagline */}
        <p
          className="mt-4 text-xs sm:text-sm font-medium tracking-wide text-slate-400 transition-opacity duration-500 ease-out"
          style={{
            opacity: stage === 'hold' || stage === 'exit' ? 1 : 0
          }}
        >
          Clean clothes. Simple life.
        </p>
      </div>
    </div>
  );
};

export default EntryAnimation;
