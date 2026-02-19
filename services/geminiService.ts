
import { GoogleGenAI, Type } from "@google/genai";
import { ValidationResult } from "../types";

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    identityMatch: {
      type: Type.BOOLEAN,
      description: "True if the person in the new photo matches the reference photo.",
    },
    dressCodeMatches: {
      type: Type.BOOLEAN,
      description: "True if the person is wearing the required uniform (orange company shirt).",
    },
    description: {
      type: Type.STRING,
      description: "A brief summary of the findings in Spanish.",
    },
  },
  required: ["identityMatch", "dressCodeMatches", "description"],
};

const cleanBase64 = (base64: string): string => {
  if (!base64) return "";
  const parts = base64.split(",");
  return parts.length > 1 ? parts[1] : parts[0];
};

/**
 * Analiza la fichada del empleado.
 * NOTA: No capturamos errores aquí para permitir que App.tsx detecte fallos de API KEY
 * y abra el selector de llaves automáticamente.
 */
export const analyzeCheckIn = async (
  currentPhotoBase64: string,
  dressCode: string,
  referencePhotoBase64: string | null
): Promise<ValidationResult> => {
  // Inicialización con la API_KEY actual del proceso
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const parts: any[] = [
    { text: `Actúa como un monitor de RRHH para UpFest. 
      Analiza la imagen actual y compárala con la de referencia si existe.
      REGLA CRÍTICA DE VESTIMENTA: El empleado DEBE vestir una prenda superior de color NARANJA.
      Si no es naranja, dressCodeMatches debe ser false.
      Instrucción de vestimenta del perfil: ${dressCode}.
      Responde estrictamente en formato JSON.` },
    { 
      inlineData: { 
        mimeType: "image/jpeg", 
        data: cleanBase64(currentPhotoBase64) 
      } 
    }
  ];

  if (referencePhotoBase64 && referencePhotoBase64.length > 100) {
    parts.push({ 
      inlineData: { 
        mimeType: "image/jpeg", 
        data: cleanBase64(referencePhotoBase64) 
      } 
    });
  }

  // Si este llamado falla (por API Key inválida o cuota), el error subirá a App.tsx
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts },
    config: {
      responseMimeType: "application/json",
      responseSchema: responseSchema,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("La IA no devolvió una respuesta válida (posible bloqueo de seguridad).");
  }

  try {
    const result = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
    return {
      identityMatch: result.identityMatch ?? true,
      dressCodeMatches: result.dressCodeMatches ?? false,
      description: result.description ?? "Validación completada."
    };
  } catch (e) {
    console.error("Error parseando respuesta de Gemini:", text);
    throw new Error("Error en el formato de respuesta de la IA.");
  }
};

export const validateEmployeePhoto = analyzeCheckIn;
