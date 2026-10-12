import { GoogleGenAI, Type } from "@google/genai";

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    identityMatch: { type: Type.BOOLEAN },
    dressCodeMatches: { type: Type.BOOLEAN },
    description: { type: Type.STRING },
  },
  required: ["identityMatch", "dressCodeMatches", "description"],
};

// Rate limit simple en memoria por IP (máx 30 por minuto)
const analyzeRateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string, maxAttempts = 30, windowMs = 60 * 1000): boolean {
  const now = Date.now();
  const entry = analyzeRateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    analyzeRateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxAttempts) {
    return false;
  }
  entry.count++;
  return true;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting por IP (30 por minuto)
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 
             req.headers['x-real-ip'] || 
             req.socket?.remoteAddress || 
             '127.0.0.1';

  if (!checkRateLimit(ip, 30, 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes al analizador. Por favor espera un minuto.' });
  }

  try {
    const { currentPhotoBase64, dressCode } = req.body || {};

    // Validar que dressCode sea string de máx 300 caracteres
    if (typeof dressCode !== 'string' || dressCode.length > 300) {
      return res.status(400).json({ error: 'El código de vestimenta debe ser un texto de máx 300 caracteres.' });
    }

    if (!currentPhotoBase64 || typeof currentPhotoBase64 !== 'string') {
      return res.status(400).json({ error: 'Payload de foto inválido o ausente.' });
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';

    let currentPhotoData = '';

    if (currentPhotoBase64.startsWith('http://') || currentPhotoBase64.startsWith('https://')) {
      // Prevención SSRF: Si currentPhotoBase64 es una URL, solo aceptarla si empieza con SUPABASE_URL + '/storage/'
      const allowedPrefix = `${supabaseUrl}/storage/`;
      if (!supabaseUrl || !currentPhotoBase64.startsWith(allowedPrefix)) {
        return res.status(400).json({ error: 'URL de imagen no permitida. Solo se aceptan recursos de Supabase Storage.' });
      }

      const resp = await fetch(currentPhotoBase64);
      if (!resp.ok) {
        return res.status(400).json({ error: 'No se pudo descargar la imagen desde la URL proporcionada.' });
      }

      const blob = await resp.blob();
      // Rechazar payloads mayores a 4 MB
      if (blob.size > 4 * 1024 * 1024) {
        return res.status(400).json({ error: 'La imagen supera el tamaño máximo permitido de 4 MB.' });
      }

      const arrayBuffer = await blob.arrayBuffer();
      currentPhotoData = Buffer.from(arrayBuffer).toString('base64');
    } else {
      // Rechazar payloads mayores a 4 MB en base64
      const byteSize = Buffer.byteLength(currentPhotoBase64, 'utf8');
      if (byteSize > 4 * 1024 * 1024) {
        return res.status(400).json({ error: 'La imagen supera el tamaño máximo permitido de 4 MB.' });
      }

      const parts = currentPhotoBase64.split(",");
      currentPhotoData = parts.length > 1 ? parts[1] : parts[0];
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    
    if (!apiKey || apiKey === 'undefined' || apiKey === 'null') {
      return res.status(200).json({ 
        aiAvailable: false,
        identityMatch: true, 
        dressCodeMatches: false, 
        description: "API Key de IA no configurada o inválida. Acuérdate de configurar la variable en Vercel." 
      });
    }

    const ai = new GoogleGenAI({ apiKey });

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
      model: 'gemini-flash-latest',
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
      aiAvailable: true,
      identityMatch: true,
      dressCodeMatches: result.dressCodeMatches ?? false,
      description: result.description ?? "Validación completada."
    });

  } catch (error: any) {
    console.error("Error en API analyze:", error.message || error);
    let description = `IA no disponible (${error.message || 'Error desconocido'}) — validación omitida`;
    
    if (error.message?.includes("429") || error.message?.includes("Quota exceeded") || error.status === 429) {
      description = "Límite diario de IA alcanzado. Intente mañana.";
    } else if (error.message?.includes("suspended") || error.message?.includes("CONSUMER_SUSPENDED") || error.message?.includes("403")) {
      description = "API Key de IA suspendida por Google. Ve a Google AI Studio y genera una clave nueva.";
    } else if (error.message?.includes("API Key not found") || error.message?.includes("API_KEY_INVALID")) {
      description = "API Key de IA no configurada o inválida. Revisa variables de entorno.";
    }

    return res.status(200).json({
      aiAvailable: false,
      identityMatch: true,
      dressCodeMatches: false,
      description
    });
  }
}
