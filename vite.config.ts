
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Definimos la API Key de forma global y fija para el despliegue
    'process.env.API_KEY': JSON.stringify('AIzaSyCwInNzcpEiQ4VBw9-iOd2Y2DsznUnhlcE')
  }
})
