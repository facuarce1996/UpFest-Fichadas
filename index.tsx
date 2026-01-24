
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Polyfill básico para asegurar la existencia del objeto process
if (typeof window !== 'undefined') {
  const win = window as any;
  if (typeof win.process === 'undefined') {
    win.process = { env: {} };
  } else if (!win.process.env) {
    win.process.env = {};
  }
}

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
