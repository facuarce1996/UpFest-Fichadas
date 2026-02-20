
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
      description: "True if the person is wearing the required uniform specified in the prompt.",
    },
    description: {
      type: Type.STRING,
      description: "A brief summary of the findings in Spanish.",
    },
  },
  required: ["identityMatch", "dressCodeMatches", "description"],
};

/**
 * Convierte una URL de imagen a una cadena Base64
 */
const imageUrlToBase64 = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        // Retornar solo la parte de datos, sin el prefijo data:image/jpeg;base64,
        resolve(base64String.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Error convirtiendo URL a Base64:", error);
    return "";
  }
};

const cleanBase64 = (base64: string): string => {
  if (!base64) return "";
  const parts = base64.split(",");
  return parts.length > 1 ? parts[1] : parts[0];
};

/**
 * Analiza la fichada del empleado.
 */
export const analyzeCheckIn = async (
  currentPhotoBase64: string,
  dressCode: string,
  referencePhotoBase64: string | null
): Promise<ValidationResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Preparar la foto actual (ya viene en Base64 desde la cámara)
  let currentPhotoData = '';
  if (currentPhotoBase64.startsWith('http')) {
    currentPhotoData = await imageUrlToBase64(currentPhotoBase64);
  } else {
    currentPhotoData = cleanBase64(currentPhotoBase64);
  }

  const parts: any[] = [
    { text: `Actúa como un monitor de RRHH para UpFest. 
      Analiza la imagen actual y compárala con la de referencia si existe.
      REGLA CRÍTICA DE VESTIMENTA: El empleado DEBE cumplir estrictamente con la siguiente instrucción de vestimenta: '${dressCode}'.
      Evalúa si la ropa en la foto actual cumple con esta regla. Si no cumple, dressCodeMatches debe ser false.
      IMPORTANTE: En tu descripción, NO menciones ningún color específico (como 'naranja') a menos que sea parte explícita de la instrucción de vestimenta proporcionada ('${dressCode}'). Si hay un incumplimiento, haz referencia a la instrucción de vestimenta dada.
      Responde estrictamente en formato JSON.` },
    { 
      inlineData: { 
        mimeType: "image/jpeg", 
        data: currentPhotoData
      } 
    }
  ];

  // Si hay foto de referencia, verificar si es URL o Base64
  if (referencePhotoBase64 && referencePhotoBase64.length > 10) {
    let refData = "";
    if (referencePhotoBase64.startsWith('http')) {
      // Es una URL de Supabase, hay que descargarla
      refData = await imageUrlToBase64(referencePhotoBase64);
    } else {
      // Es Base64 directo
      refData = cleanBase64(referencePhotoBase64);
    }

    if (refData) {
      parts.push({ 
        inlineData: { 
          mimeType: "image/jpeg", 
          data: refData
        } 
      });
    }
  }

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
    throw new Error("La IA no devolvió una respuesta válida.");
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
