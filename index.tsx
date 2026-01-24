
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Polyfill robusto para asegurar que process.env exista en el navegador
if (typeof window !== 'undefined') {
  if (typeof (window as any).process === 'undefined') {
    (window as any).process = { env: {} };
  } else if (!(window as any).process.env) {
    (window as any).process.env = {};
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
