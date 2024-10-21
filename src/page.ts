import { createRoot } from 'react-dom/client';
import { Main } from './components/main';

import './index.css';

document.addEventListener('DOMContentLoaded', () => {
  const root = createRoot(window.document.getElementById('root')!);
  root.render(Main);
});
