
import { GoogleGenAI, Type, Part } from "@google/genai";
import { ValidationResult } from "../types";

const cleanBase64 = (dataUrl: string) => {
  if (!dataUrl) return "";
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) return dataUrl;
  return dataUrl.substring(commaIndex + 1);
};

const getBase64FromUrl = async (url: string): Promise<string | null> => {
  try {
    // Intentamos cargar la imagen. Si falla por CORS, retornamos null y la IA validará sin referencia.
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        resolve(cleanBase64(base64String));
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    return null;
  }
};

const validationSchema = {
  type: Type.OBJECT,
  properties: {
    identityMatch: {
      type: Type.BOOLEAN,
      description: "True if person in photo matches reference or if a clear face is present.",
    },
    dressCodeMatches: {
      type: Type.BOOLEAN,
      description: "True if clothing meets specified criteria.",
    },
    description: {
      type: Type.STRING,
      description: "Brief summary of the analysis in Spanish.",
    },
    confidence: {
      type: Type.NUMBER,
      description: "Confidence level 0-1.",
    },
  },
  required: ["identityMatch", "dressCodeMatches", "description", "confidence"],
};

export const analyzeCheckIn = async (
  checkInImage: string,
  dressCodeDescription: string,
  referenceImage: string | null
): Promise<ValidationResult> => {
  const MAX_RETRIES = 1;
  let attempt = 0;

  const executeAnalysis = async (): Promise<ValidationResult> => {
    // Usamos el modelo gemini-2.5-flash-preview para mejor soporte de visión en modo preview
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
    if (!checkInBase64) throw new Error("Captura de cámara vacía.");

    const prompt = `Analiza para UpFest:
      1. IDENTIDAD: ${refBase64 ? 'Compara la foto de referencia (1ra) con la actual (2da). ¿Es el mismo?' : '¿Hay un rostro humano visible?'}
      2. VESTIMENTA: ¿Cumple con "${dressCodeDescription || 'Uniforme'}?
      Responde JSON según esquema.`;

    if (refBase64) {
      parts.push({ inlineData: { mimeType: "image/jpeg", data: refBase64 } });
    }
    parts.push({ inlineData: { mimeType: "image/jpeg", data: checkInBase64 } });
    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview", 
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: validationSchema,
        temperature: 0.1
      },
    });

    const resultText = response.text;
    if (!resultText) throw new Error("Respuesta vacía de IA.");
    return JSON.parse(resultText);
  };

  while (attempt <= MAX_RETRIES) {
    try {
      return await executeAnalysis();
    } catch (error: any) {
      console.error("Gemini Error:", error);
      
      if (attempt < MAX_RETRIES) {
        attempt++;
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      // Devolvemos el error real en la descripción para que el usuario pueda diagnosticar
      const detail = error?.message || "Error desconocido";
      return { 
          identityMatch: false, 
          dressCodeMatches: false, 
          description: `Error IA: ${detail}. Revise conexión o API Key.`, 
          confidence: 0 
      };
    }
  }

  return { identityMatch: false, dressCodeMatches: false, description: "Fallo tras reintentos.", confidence: 0 };
};
