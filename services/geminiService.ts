
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

// Función auxiliar para limpiar el prefijo de base64
const cleanBase64 = (base64: string): string => {
  if (!base64) return "";
  return base64.includes(",") ? base64.split(",")[1] : base64;
};

export const analyzeCheckIn = async (
  currentPhotoBase64: string,
  dressCode: string,
  referencePhotoBase64: string | null
): Promise<ValidationResult> => {
  // CRITICAL: Initialize inside the function to capture the latest process.env.API_KEY
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const parts: any[] = [
      { text: `Actúa como un inspector de recursos humanos de UpFest.
        Misión:
        1. Compara la foto actual con la de referencia (si existe).
        2. Verifica si el empleado cumple con el código de vestimenta: ${dressCode}.
        Regla de oro de UpFest: Buscamos específicamente una remera o prenda superior de color NARANJA.
        Responde siempre en español de forma profesional y breve.` },
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

    const text = response.text || "{}";
    const result = JSON.parse(text);
    
    return {
      identityMatch: result.identityMatch ?? true, // Default to true if reference is missing
      dressCodeMatches: result.dressCodeMatches ?? false,
      description: result.description ?? "Análisis completado."
    };
  } catch (error: any) {
    console.error("Gemini validation error:", error);
    
    // Si el error es de autenticación, lanzamos el error para que App.tsx lo capture y pida la llave
    if (error.message?.includes("API key") || error.message?.includes("403") || error.message?.includes("401")) {
      throw error; 
    }

    return {
      identityMatch: false,
      dressCodeMatches: false,
      description: "Error de conexión con la IA. Reintente en unos instantes."
    };
  }
};

export const validateEmployeePhoto = analyzeCheckIn;
