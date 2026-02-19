
import { GoogleGenAI, Type } from "@google/genai";
import { ValidationResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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

// Renamed from validateEmployeePhoto to analyzeCheckIn as expected by App.tsx
export const analyzeCheckIn = async (
  currentPhotoBase64: string,
  dressCode: string,
  referencePhotoBase64: string | null
): Promise<ValidationResult> => {
  try {
    const parts: any[] = [
      { text: `Actúa como un inspector de recursos humanos de UpFest.
        1. Compara la foto actual con la de referencia (si existe).
        2. Verifica si el empleado cumple con: ${dressCode}.
        Reglas: Identifica si hay una remera naranja con logo o lisa naranja.
        Responde en español.` },
      { inlineData: { mimeType: "image/jpeg", data: currentPhotoBase64.split(',')[1] || currentPhotoBase64 } }
    ];

    if (referencePhotoBase64) {
      parts.push({ inlineData: { mimeType: "image/jpeg", data: referencePhotoBase64.split(',')[1] || referencePhotoBase64 } });
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
      identityMatch: result.identityMatch ?? false,
      dressCodeMatches: result.dressCodeMatches ?? false,
      description: result.description ?? "No se obtuvo descripción de la IA."
    };
  } catch (error) {
    console.error("Gemini validation error:", error);
    return {
      identityMatch: false,
      dressCodeMatches: false,
      description: "Error técnico al procesar la imagen."
    };
  }
};

export const validateEmployeePhoto = analyzeCheckIn;
