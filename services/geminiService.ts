import { GoogleGenAI, Type, Schema, Part } from "@google/genai";
import { ValidationResult } from "../types";

const cleanBase64 = (dataUrl: string) => {
  return dataUrl.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
};

// Helper function to fetch an image from a URL and convert it to Base64
// This is necessary because Gemini API inlineData expects raw bytes, not a URL.
const getBase64FromUrl = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        resolve(cleanBase64(base64String));
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Error converting URL to Base64:", error);
    throw error;
  }
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
    // Robust API Key detection: Try process.env first (Vercel standard), then VITE_ var (Vite standard)
    const apiKey = process.env.API_KEY || import.meta.env.VITE_API_KEY;
    
    if (!apiKey) {
      console.error("API Key is missing. Please check Vercel environment variables (API_KEY or VITE_API_KEY).");
      return {
        identityMatch: false,
        dressCodeMatches: false,
        description: "Error de configuración: Falta la API Key del sistema.",
        confidence: 0
      };
    }

    const ai = new GoogleGenAI({ apiKey });

    const parts: Part[] = [];
    
    // Prompt construction in Spanish
    let prompt = `
      Eres un oficial de seguridad para la empresa UpFest.
      Analiza las imágenes proporcionadas para validar la fichada de un empleado.
      RESPONDE SIEMPRE EN ESPAÑOL.
      
      Tarea 1: Validación de Vestimenta
      El código de vestimenta requerido es: "${dressCodeDescription || 'Vestimenta formal o uniforme de trabajo'}".
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
      
      // Handle Reference Image: It might be a URL (from DB) or Base64 (from upload)
      let referenceImageBase64 = "";
      if (referenceImage.startsWith('http')) {
          referenceImageBase64 = await getBase64FromUrl(referenceImage);
      } else {
          referenceImageBase64 = cleanBase64(referenceImage);
      }

      // Add Reference Image Part
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: referenceImageBase64,
        },
      });
    } else {
      prompt += `
      Tarea 2: Detección de Rostro
      Como no se proporcionó foto de referencia, solo verifica que la 'Imagen de Fichada' contenga un rostro humano claramente visible.
      `;
    }

    // Add Check-In Image Part (Always Base64 from Canvas)
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