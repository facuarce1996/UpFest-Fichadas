import { GoogleGenAI, Type, Schema } from "@google/genai";
import { ValidationResult } from "../types";

const cleanBase64 = (dataUrl: string) => {
  return dataUrl.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
};

const validationSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    identityMatch: {
      type: Type.BOOLEAN,
      description: "Verdadero si la persona en la foto coincide con la referencia. Si no hay referencia, verdadero si hay un rostro humano.",
    },
    dressCodeMatches: {
      type: Type.BOOLEAN,
      description: "Indica si la vestimenta coincide con el código requerido.",
    },
    description: {
      type: Type.STRING,
      description: "Una breve explicación en español sobre la verificación de identidad y vestimenta.",
    },
    confidence: {
      type: Type.NUMBER,
      description: "Puntaje de confianza entre 0 y 1.",
    },
  },
  required: ["identityMatch", "dressCodeMatches", "description", "confidence"],
};

export const analyzeCheckIn = async (
  checkInImage: string,
  dressCodeDescription: string,
  referenceImage: string | null
): Promise<ValidationResult> => {
  try {
    // Vite reemplazará esto por el string real durante el build
    const apiKey = process.env.API_KEY;
    
    if (!apiKey) {
      console.error("API Key is missing. Please check Vercel environment variables.");
      return {
        identityMatch: false,
        dressCodeMatches: false,
        description: "Error de configuración: Falta la API Key del sistema.",
        confidence: 0
      };
    }

    const ai = new GoogleGenAI({ apiKey });

    const parts: any[] = [];
    
    // Prompt construction in Spanish
    let prompt = `
      Eres un oficial de seguridad para la empresa UpFest.
      Analiza las imágenes proporcionadas para validar la fichada de un empleado.
      RESPONDE SIEMPRE EN ESPAÑOL.
      
      Tarea 1: Validación de Vestimenta
      El código de vestimenta requerido es: "${dressCodeDescription}".
      ¿La persona en la 'Imagen de Fichada' cumple con esto? Explica por qué.
    `;

    if (referenceImage) {
      prompt += `
      Tarea 2: Verificación de Identidad
      Se proporcionan dos imágenes.
      - La primera es la 'Foto de Referencia' del empleado.
      - La segunda es la 'Imagen de Fichada' (selfie actual).
      Compara los rostros. ¿Son la misma persona? Sé estricto.
      `;
      
      // Add Reference Image Part
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: cleanBase64(referenceImage),
        },
      });
    } else {
      prompt += `
      Tarea 2: Detección de Rostro
      Como no se proporcionó foto de referencia, solo verifica que la 'Imagen de Fichada' contenga un rostro humano claramente visible.
      `;
    }

    // Add Check-In Image Part
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: cleanBase64(checkInImage),
      },
    });

    // Add Text Prompt Part
    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash", 
      contents: {
        parts: parts,
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: validationSchema,
        systemInstruction: "Eres un bot de seguridad y cumplimiento estricto. Tu idioma de respuesta es Español.",
        temperature: 0.2,
      },
    });

    const resultText = response.text;
    if (!resultText) throw new Error("No response from AI");

    const parsed = JSON.parse(resultText);
    return parsed;

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return {
      identityMatch: false,
      dressCodeMatches: false,
      description: "Error conectando con el servicio de IA. Intente nuevamente.",
      confidence: 0
    };
  }
};