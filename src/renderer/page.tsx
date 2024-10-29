import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './components/app';

import './index.css';

document.addEventListener('DOMContentLoaded', () => {
  const root = createRoot(window.document.getElementById('root')!);
  root.render(React.createElement(App));
});
