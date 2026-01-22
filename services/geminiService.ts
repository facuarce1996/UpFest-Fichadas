
import { GoogleGenAI, Type, Part } from "@google/genai";
import { ValidationResult } from "../types";

const cleanBase64 = (dataUrl: string) => {
  if (!dataUrl) return "";
  // Buscamos la primera coma que separa el encabezado de los datos base64
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) return dataUrl;
  return dataUrl.substring(commaIndex + 1);
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
    console.warn("No se pudo recuperar la imagen de referencia:", error);
    return null;
  }
};

const validationSchema = {
  type: Type.OBJECT,
  properties: {
    identityMatch: {
      type: Type.BOOLEAN,
      description: "Verdadero si el rostro coincide con la referencia.",
    },
    dressCodeMatches: {
      type: Type.BOOLEAN,
      description: "Verdadero si la vestimenta cumple el código.",
    },
    description: {
      type: Type.STRING,
      description: "Resumen del análisis.",
    },
    confidence: {
      type: Type.NUMBER,
      description: "Confianza entre 0 y 1.",
    },
  },
  required: ["identityMatch", "dressCodeMatches", "description", "confidence"],
};

export const analyzeCheckIn = async (
  checkInImage: string,
  dressCodeDescription: string,
  referenceImage: string | null
): Promise<ValidationResult> => {
  const MAX_RETRIES = 3;
  let attempt = 0;

  const executeAnalysis = async (): Promise<ValidationResult> => {
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

    const checkInBase64 = cleanBase64(checkInImage);
    if (!checkInBase64) {
      throw new Error("La imagen capturada es inválida o está vacía.");
    }

    const prompt = `Analiza esta fichada de UpFest:
      1. ROSTRO: ${refBase64 ? 'Compara con la referencia adjunta.' : 'Verifica rostro humano visible.'}
      2. VESTIMENTA: ¿Cumple con "${dressCodeDescription || 'Uniforme estándar'}"?
      Responde estrictamente en formato JSON.`;

    if (refBase64 && refBase64.length > 0) {
      parts.push({ inlineData: { mimeType: "image/jpeg", data: refBase64 } });
    }
    
    parts.push({ inlineData: { mimeType: "image/jpeg", data: checkInBase64 } });
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
    if (!resultText) throw new Error("Respuesta vacía de la IA.");
    
    return JSON.parse(resultText);
  };

  while (attempt < MAX_RETRIES) {
    try {
      return await executeAnalysis();
    } catch (error: any) {
      attempt++;
      const isOverloaded = error.message?.includes("503") || error.message?.includes("overloaded");
      const isBadRequest = error.message?.includes("400") || error.message?.includes("INVALID_ARGUMENT");
      
      if (isOverloaded && attempt < MAX_RETRIES) {
        console.warn(`Modelo sobrecargado. Reintento ${attempt} de ${MAX_RETRIES}...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }

      console.error("AI Analysis Error Details:", error);
      
      let msg = "Error en el servidor de Inteligencia Artificial.";
      if (isBadRequest) {
          msg = "Error: Los datos de imagen enviados no son válidos. Intenta capturar la foto nuevamente.";
      } else if (error.message?.includes("403") || error.message?.includes("API_KEY_INVALID") || error.message?.includes("permission")) {
          msg = "Error de Permisos: Revisa la API_KEY en las variables de entorno de tu servidor.";
      } else if (error.message?.includes("429")) {
          msg = "Error: Límite de cuota de IA excedido.";
      } else if (isOverloaded) {
          msg = "El servidor de IA está saturado. Por favor, intenta de nuevo en unos segundos.";
      }

      return { 
          identityMatch: false, 
          dressCodeMatches: false, 
          description: msg, 
          confidence: 0 
      };
    }
  }

  return { 
    identityMatch: false, 
    dressCodeMatches: false, 
    description: "No se pudo conectar con la IA tras varios intentos.", 
    confidence: 0 
  };
};
