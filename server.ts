import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Permitir JSON bodies grandes por las imágenes en base64
  app.use(express.json({ limit: '50mb' }));

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      identityMatch: { type: Type.BOOLEAN },
      dressCodeMatches: { type: Type.BOOLEAN },
      description: { type: Type.STRING },
    },
    required: ["identityMatch", "dressCodeMatches", "description"],
  };

  app.post("/api/analyze", async (req, res) => {
    try {
      const { currentPhotoBase64, dressCode } = req.body;
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      
      if (!apiKey || apiKey === 'undefined' || apiKey === 'null') {
        return res.status(400).json({ 
          identityMatch: true, dressCodeMatches: true, 
          description: "API Key de IA no configurada o inválida. Acuérdate de configurar la variable en el entorno (Vercel/Render)." 
        });
      }

      const ai = new GoogleGenAI({ apiKey });
      
      let currentPhotoData = '';
      if (currentPhotoBase64.startsWith('http')) {
         const resp = await fetch(currentPhotoBase64);
         const blob = await resp.blob();
         const arrayBuffer = await blob.arrayBuffer();
         currentPhotoData = Buffer.from(arrayBuffer).toString('base64');
      } else {
         const parts = currentPhotoBase64.split(",");
         currentPhotoData = parts.length > 1 ? parts[1] : parts[0];
      }

      const parts = [
        { text: `Actúa como un monitor de RRHH para UpFest.
          Analiza la imagen actual.
          REGLA CRÍTICA DE VESTIMENTA: '${dressCode}'.
          Evalúa si cumple el código de vestimenta.
          IMPORTANTE: Debido a políticas de privacidad, está prohibido evaluar la identidad. En el JSON generado, debes poner "identityMatch" como true obligatoriamente y en "description" NO debes mencionar absolutamente nada sobre la identidad o la validación facial, enfócate únicamente en la vestimenta.
          Responde en JSON.` },
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: currentPhotoData
          }
        }
      ];

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts },
        config: {
          responseMimeType: "application/json",
          responseSchema: responseSchema,
        },
      });

      const text = response.text;
      if (!text) throw new Error("La IA no devolvió una respuesta válida.");

      const result = JSON.parse(text.trim());
      return res.status(200).json({
        identityMatch: result.identityMatch ?? true,
        dressCodeMatches: result.dressCodeMatches ?? true,
        description: result.description ?? "Validación completada."
      });

    } catch (error: any) {
      console.error("Error en API:", error);
      let description = `IA no disponible (${error.message || 'Error desconocido'}) — validación omitida`;
      
      if (error.message?.includes("429") || error.message?.includes("Quota exceeded") || error.status === 429) {
        description = "Límite diario de IA alcanzado. Intente mañana.";
      } else if (error.message?.includes("suspended") || error.message?.includes("CONSUMER_SUSPENDED") || error.message?.includes("403")) {
        description = "API Key de IA suspendida por Google. Ve a Google AI Studio o GCP y genera una clave nueva.";
      } else if (error.message?.includes("API Key not found") || error.message?.includes("API_KEY_INVALID")) {
        description = "API Key de IA no configurada o inválida. Revisa variables de entorno.";
      }

      return res.status(200).json({
        identityMatch: true,
        dressCodeMatches: true,
        description
      });
    }
  });

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
