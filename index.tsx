
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Polyfill robusto para asegurar que process.env exista en el navegador
if (typeof window !== 'undefined') {
  const win = window as any;
  if (typeof win.process === 'undefined') {
    win.process = { env: {} };
  } else if (!win.process.env) {
    win.process.env = {};
  }
  
  // Establecer la API Key proporcionada como fallback fijo para despliegues externos (Vercel)
  // Se prioriza cualquier variable ya inyectada por el entorno
  win.process.env.API_KEY = win.process.env.API_KEY || 'AIzaSyCwInNzcpEiQ4VBw9-iOd2Y2DsznUnhlcE';
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
