
import { GoogleGenAI, Type, Schema, Part } from "@google/genai";
import { ValidationResult } from "../types";

const cleanBase64 = (dataUrl: string) => {
  return dataUrl.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
};

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
      description: "Verdadero si la persona en la foto coincide con la referencia.",
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
    const apiKey = process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey: apiKey! });

    const parts: Part[] = [];
    let prompt = `
      Oficial de seguridad de UpFest.
      Valida:
      1. Vestimenta: "${dressCodeDescription || 'Formal'}".
      2. Identidad: Compara rostros si hay referencia.
      RESPONDE EN ESPAÑOL.
    `;

    if (referenceImage) {
      let referenceImageBase64 = referenceImage.startsWith('http') 
        ? await getBase64FromUrl(referenceImage) 
        : cleanBase64(referenceImage);

      parts.push({ inlineData: { mimeType: "image/jpeg", data: referenceImageBase64 } });
    }

    parts.push({ inlineData: { mimeType: "image/jpeg", data: cleanBase64(checkInImage) } });
    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents: { parts: parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: validationSchema,
      },
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    return { identityMatch: false, dressCodeMatches: false, description: "Error IA", confidence: 0 };
  }
};

/**
 * Genera una explicación humana para una discrepancia horaria
 */
export const generateIncidentExplanation = async (
  userName: string,
  scheduledIn: string,
  realIn: string,
  scheduledOut: string,
  realOut: string
): Promise<string> => {
  try {
    const apiKey = process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey: apiKey! });

    const prompt = `
      Como asistente de RRHH de UpFest, redacta una ÚNICA oración profesional y breve explicando la incidencia del empleado ${userName}.
      Horario Teórico: Entrada ${scheduledIn}, Salida ${scheduledOut}.
      Fichada Real: Entrada ${realIn}, Salida ${realOut}.
      Si llegó tarde, menciónalo. Si se retiró antes, menciónalo. Sé cordial pero preciso.
      Si los horarios coinciden perfectamente, di que cumplió satisfactoriamente.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { temperature: 0.7 }
    });

    return response.text || "Sin detalle disponible.";
  } catch (error) {
    return "No se pudo generar el detalle con IA.";
  }
};
