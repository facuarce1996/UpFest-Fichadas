
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Esto asegura que las referencias a process.env.API_KEY sean tratadas correctamente
    // El valor real se resolverá en tiempo de ejecución gracias al polyfill de index.tsx
    'process.env.API_KEY': 'process.env.API_KEY'
  }
})
