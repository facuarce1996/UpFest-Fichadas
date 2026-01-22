
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Se remueve la sección 'define' para evitar que process.env.API_KEY 
  // sea reemplazado por un string vacío durante la compilación.
})
