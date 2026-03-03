import { GoogleGenAI, Type } from "@google/genai";
import { ValidationResult } from "../types";


// 🔴 SWITCH GLOBAL — CAMBIAR A true CUANDO QUIERAS REACTIVAR IA
const IA_ENABLED = true;


const responseSchema = {
  type: Type.OBJECT,
  properties: {
    identityMatch: { type: Type.BOOLEAN },
    dressCodeMatches: { type: Type.BOOLEAN },
    description: { type: Type.STRING },
  },
  required: ["identityMatch", "dressCodeMatches", "description"],
};


/**
 * Convierte una URL de imagen a Base64
 */
const imageUrlToBase64 = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve((reader.result as string).split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  } catch {
    return "";
  }
};


const cleanBase64 = (base64: string): string => {
  if (!base64) return "";
  const parts = base64.split(",");
  return parts.length > 1 ? parts[1] : parts[0];
};



export const analyzeCheckIn = async (
  currentPhotoBase64: string,
  dressCode: string,
  referencePhotoBase64: string | null
): Promise<ValidationResult> => {


  // 🟢 MODO SEGURO — IA DESACTIVADA
  if (!IA_ENABLED) {
    console.log("IA desactivada — se guarda fichada sin validación");

    return {
      identityMatch: true, // no bloquea
      dressCodeMatches: true, // no bloquea
      description: "Validación automática desactivada temporalmente"
    };
  }


  // 🔽 TU CÓDIGO ORIGINAL — NO TOCAR

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY });

  let currentPhotoData = '';
  if (currentPhotoBase64.startsWith('http')) {
    currentPhotoData = await imageUrlToBase64(currentPhotoBase64);
  } else {
    currentPhotoData = cleanBase64(currentPhotoBase64);
  }

  const parts: any[] = [
    { text: `Actúa como un monitor de RRHH para UpFest.
      Analiza la imagen actual y compárala con la de referencia si existe.
      REGLA CRÍTICA DE VESTIMENTA: '${dressCode}'.
      Responde en JSON.` },
    {
      inlineData: {
        mimeType: "image/jpeg",
        data: currentPhotoData
      }
    }
  ];

  if (referencePhotoBase64 && referencePhotoBase64.length > 10) {
    let refData = referencePhotoBase64.startsWith('http')
      ? await imageUrlToBase64(referencePhotoBase64)
      : cleanBase64(referencePhotoBase64);

    if (refData) {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: refData
        }
      });
    }
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-latest',
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    const text = response.text;
    if (!text) throw new Error("La IA no devolvió una respuesta válida.");

    const result = JSON.parse(text.trim());

    return {
      identityMatch: result.identityMatch ?? true,
      dressCodeMatches: result.dressCodeMatches ?? true,
      description: result.description ?? "Validación completada."
    };

  } catch (error: any) {
    console.error("IA falló — se guarda igual", error);

    let description = `IA no disponible (${error.message || 'Error desconocido'}) — validación omitida`;
    
    // Detectar error de cuota excedida (429)
    if (error.message?.includes("429") || error.message?.includes("Quota exceeded") || error.status === 429) {
      description = "Límite diario de IA alcanzado. Intente mañana.";
    }

    // 🔴 FALLBACK AUTOMÁTICO
    return {
      identityMatch: true,
      dressCodeMatches: true,
      description: description
    };
  }
};

export const validateEmployeePhoto = analyzeCheckIn;