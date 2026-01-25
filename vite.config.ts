
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Eliminamos la clave fija para que el SDK tome la del entorno de ejecución
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY)
  }
})
