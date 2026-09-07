import { useCallback, useEffect, useState } from 'react';
import { settings } from '../lib/settingsStore';

export function useTheme() {
  const [theme, setThemeState] = useState(settings.getTheme());
  const [reduceMotion, setReduceMotionState] = useState(settings.getReduceMotion());

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  }, [reduceMotion]);

  const setTheme = useCallback((id) => {
    settings.setTheme(id);
    setThemeState(id);
  }, []);

  const setReduceMotion = useCallback((v) => {
    settings.setReduceMotion(v);
    setReduceMotionState(v);
  }, []);

  return { theme, setTheme, reduceMotion, setReduceMotion };
}
