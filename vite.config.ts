import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Carga las variables de entorno basándose en el modo (development/production)
  // process.cwd() puede fallar si no se tipa correctamente, aquí usamos una carga segura
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    define: {
      // Esto reemplaza 'process.env.API_KEY' en tu código con el valor real string durante el build
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      // Polyfill de seguridad para evitar crashes si alguna librería intenta acceder a process.env
      'process.env': {}
    }
  }
})