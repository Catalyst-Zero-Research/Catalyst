import { useEffect } from 'react';
import { useCatalystLayout } from '@/catalyst/bridge/hooks';
import { SubmissionShell } from '@/components/submission/SubmissionShell';

function App() {
  const { theme, density } = useCatalystLayout();

  useEffect(() => {
    const root = window.document.documentElement;
    const isLight = theme === 'light';
    root.classList.toggle('light', isLight);
    root.classList.toggle('dark', !isLight);
    root.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.setAttribute('data-density', density);
  }, [density]);

  return <SubmissionShell />;
}

export default App;
