
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Polyfill de emergencia para process.env
// Se asegura de no sobrescribir variables ya definidas por el entorno
try {
  if (typeof (window as any).process === 'undefined') {
    (window as any).process = { env: {} };
  } else if (!(window as any).process.env) {
    (window as any).process.env = {};
  }
} catch (e) {
  console.warn("No se pudo definir el polyfill de process:", e);
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error("No se encontró el elemento raíz 'root'.");
} else {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
