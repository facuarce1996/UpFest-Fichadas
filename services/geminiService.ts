
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
  return base64.includes(",") ? base64.split(",")[1] : base64;
};

/**
 * Procesa la respuesta de texto de Gemini para extraer JSON puro incluso si viene con Markdown.
 */
const parseGeminiResponse = (text: string) => {
  try {
    // Eliminar posibles bloques de código Markdown
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("Error al parsear JSON de Gemini:", text);
    throw new Error("Respuesta de IA malformada");
  }
};

export const analyzeCheckIn = async (
  currentPhotoBase64: string,
  dressCode: string,
  referencePhotoBase64: string | null
): Promise<ValidationResult> => {
  // Inicialización inmediata para usar la API_KEY del entorno actual
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const parts: any[] = [
      { text: `Actúa como un experto en seguridad y RRHH de UpFest.
        TAREAS:
        1. Compara las fotos para confirmar identidad.
        2. Verifica vestimenta: ${dressCode}. BUSCAMOS COLOR NARANJA.
        
        IMPORTANTE: Si no puedes confirmar la identidad por falta de claridad, prioriza la vestimenta naranja.
        Respuesta técnica en JSON, idioma español.` },
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

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    // Validar si la respuesta fue bloqueada por seguridad
    if (!response.text) {
      return {
        identityMatch: false,
        dressCodeMatches: false,
        description: "El análisis fue omitido por filtros de seguridad de la IA (rostro no claro)."
      };
    }

    const result = parseGeminiResponse(response.text);
    
    return {
      identityMatch: result.identityMatch ?? true,
      dressCodeMatches: result.dressCodeMatches ?? false,
      description: result.description ?? "Análisis visual completado."
    };
  } catch (error: any) {
    console.error("Gemini Critical Error:", error);
    
    const errMsg = error.message || "";
    
    // Si es error de credenciales o cuota, relanzamos para que la App abra el selector de llaves
    if (
      errMsg.includes("API key") || 
      errMsg.includes("403") || 
      errMsg.includes("401") || 
      errMsg.includes("429") ||
      errMsg.includes("not found")
    ) {
      throw error; 
    }

    return {
      identityMatch: false,
      dressCodeMatches: false,
      description: "Error técnico en el procesamiento de imagen. Reintente."
    };
  }
};

export const validateEmployeePhoto = analyzeCheckIn;
