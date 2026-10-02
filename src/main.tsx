import { createRoot } from 'react-dom/client';
import { App } from './App';
import '@fontsource-variable/noto-sans-sc';
import '@fontsource-variable/noto-serif-sc';
import './styles.css';
createRoot(document.getElementById('root')!).render(<App />);
