import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/newsreader';
import '@fontsource-variable/outfit';
import { App } from './App';
import { MotionPreferenceProvider } from './components/MotionPreference';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionPreferenceProvider>
      <App />
    </MotionPreferenceProvider>
  </StrictMode>
);
