import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import loginHandler from "./api/login";
import analyzeHandler from "./api/analyze";
import timeHandler from "./api/time";

// Cargar variables de entorno locales si no están presentes
if (typeof process.loadEnvFile === 'function') {
  try {
    if (fs.existsSync(path.resolve(process.cwd(), '.env'))) {
      process.loadEnvFile(path.resolve(process.cwd(), '.env'));
    }
  } catch (e) {
    // Ignorar si no se puede cargar
  }
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);

  const portArgIndex = process.argv.indexOf('--port');
  const portArg = portArgIndex !== -1 ? process.argv[portArgIndex + 1] : undefined;
  const PORT = Number(portArg || process.env.PORT || 3000);

  // Permitir JSON bodies grandes por las imágenes en base64
  app.use(express.json({ limit: '50mb' }));

  // Rutas API delegadas a las funciones serverless de Vercel
  app.all("/api/login", (req, res) => loginHandler(req, res));
  app.all("/api/analyze", (req, res) => analyzeHandler(req, res));
  app.all("/api/time", (req, res) => timeHandler(req, res));

  // Vite middleware en desarrollo
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { server: httpServer } },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
