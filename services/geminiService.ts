
import { GoogleGenAI, Type, Part } from "@google/genai";
import { ValidationResult } from "../types";

const cleanBase64 = (dataUrl: string) => {
  return dataUrl.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
};

const getBase64FromUrl = async (url: string): Promise<string | null> => {
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
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
    console.warn("No se pudo recuperar la imagen de referencia (posible error de CORS):", error);
    return null;
  }
};

const validationSchema = {
  type: Type.OBJECT,
  properties: {
    identityMatch: {
      type: Type.BOOLEAN,
      description: "Verdadero si la persona en la foto coincide con la referencia. Si no hay referencia, devolver true.",
    },
    dressCodeMatches: {
      type: Type.BOOLEAN,
      description: "Indica si la vestimenta coincide con el código requerido.",
    },
    description: {
      type: Type.STRING,
      description: "Una breve explicación en español sobre la verificación.",
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
    // Inicializar cliente justo antes del uso para asegurar que tome la última API KEY inyectada
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const parts: Part[] = [];
    
    let refBase64: string | null = null;
    if (referenceImage) {
        if (referenceImage.startsWith('http')) {
            refBase64 = await getBase64FromUrl(referenceImage);
        } else {
            refBase64 = cleanBase64(referenceImage);
        }
    }

    const prompt = `Actúa como oficial de seguridad de UpFest. Analiza la imagen actual.
      REGLAS:
      1. Vestimenta requerida: "${dressCodeDescription || 'Ropa formal de trabajo'}".
      2. Identidad: ${refBase64 ? 'Compara con la foto de referencia adjunta para confirmar que es la misma persona.' : 'No hay referencia, valida solo presencia de rostro.'}
      
      RESPONDE SOLO EN JSON.`;

    if (refBase64) {
      parts.push({ inlineData: { mimeType: "image/jpeg", data: refBase64 } });
    }
    
    parts.push({ inlineData: { mimeType: "image/jpeg", data: cleanBase64(checkInImage) } });
    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents: { parts: parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: validationSchema,
        temperature: 0.1,
      },
    });

    const resultText = response.text?.trim();
    if (!resultText) throw new Error("Sin respuesta del modelo");
    
    return JSON.parse(resultText);
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    
    let errorMessage = "Error en el servidor de Inteligencia Artificial.";
    const errorStr = JSON.stringify(error).toLowerCase();
    
    if (errorStr.includes("expired") || errorStr.includes("api_key") || errorStr.includes("invalid")) {
        errorMessage = "La llave de acceso (API Key) ha expirado o es inválida. Por favor, selecciona una nueva llave desde el botón de configuración.";
    } else if (errorStr.includes("quota") || errorStr.includes("exhausted")) {
        errorMessage = "Se ha agotado la cuota gratuita de la IA. Inténtalo de nuevo más tarde o usa otra llave.";
    }

    return { 
        identityMatch: false, 
        dressCodeMatches: false, 
        description: errorMessage, 
        confidence: 0 
    };
  }
};

export const generateIncidentExplanation = async (
  userName: string,
  scheduledIn: string,
  realIn: string,
  scheduledOut: string,
  realOut: string
): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `Redacta una breve nota de RRHH para ${userName}. Programado: ${scheduledIn}-${scheduledOut}. Real: ${realIn}-${realOut}.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { temperature: 0.5 }
    });

    return response.text || "Sin detalle.";
  } catch (error) {
    console.error("Error en generateIncidentExplanation:", error);
    return "No se pudo generar explicación.";
  }
};
