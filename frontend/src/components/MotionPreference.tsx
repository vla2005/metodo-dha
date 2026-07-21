import { MotionConfig } from 'framer-motion';
import { createContext, useContext, useEffect } from 'react';
import type { ReactNode } from 'react';

interface MotionPreferenceValue {
  reducedMotion: boolean;
}

const MotionPreferenceContext = createContext<MotionPreferenceValue | null>(null);
const FULL_MOTION_PREFERENCE: MotionPreferenceValue = { reducedMotion: false };

export function MotionPreferenceProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.dataset.motion = 'full';
    return () => {
      delete document.documentElement.dataset.motion;
    };
  }, []);

  return (
    <MotionPreferenceContext.Provider value={FULL_MOTION_PREFERENCE}>
      <MotionConfig reducedMotion="never">{children}</MotionConfig>
    </MotionPreferenceContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMotionPreference(): MotionPreferenceValue {
  const value = useContext(MotionPreferenceContext);
  if (!value) {
    throw new Error('useMotionPreference precisa estar dentro de MotionPreferenceProvider.');
  }
  return value;
}
