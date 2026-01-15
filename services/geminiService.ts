
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
    console.warn("No se pudo recuperar la imagen de referencia:", error);
    return null;
  }
};

const validationSchema = {
  type: Type.OBJECT,
  properties: {
    identityMatch: {
      type: Type.BOOLEAN,
      description: "Verdadero si el rostro en la foto actual coincide con el de la foto de referencia. Si no hay referencia, validar que hay un rostro humano presente.",
    },
    dressCodeMatches: {
      type: Type.BOOLEAN,
      description: "Verdadero si la vestimenta del colaborador cumple con los requisitos descritos.",
    },
    description: {
      type: Type.STRING,
      description: "Explicación breve y profesional de los resultados del análisis.",
    },
    confidence: {
      type: Type.NUMBER,
      description: "Nivel de confianza de la IA entre 0 y 1.",
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
    // Inicialización del cliente con la clave del entorno
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

    const prompt = `Actúa como un supervisor de seguridad y RRHH para la empresa UpFest. 
      Analiza la foto actual del colaborador que está realizando su fichada.
      
      TAREAS:
      1. Rostro: ${refBase64 ? 'Compara el rostro de la foto actual con la foto de referencia adjunta para verificar identidad.' : 'Verifica que la persona en la foto es un humano real con el rostro visible.'}
      2. Vestimenta: Comprueba si cumple con el siguiente código de vestimenta: "${dressCodeDescription || 'Ropa formal oscura'}".
      
      IMPORTANTE: Devuelve la respuesta estrictamente en formato JSON siguiendo el esquema proporcionado.`;

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
    if (!resultText) throw new Error("Respuesta vacía de la IA");
    
    return JSON.parse(resultText);
  } catch (error: any) {
    console.error("Detalle del Error de IA:", error);
    
    let userFriendlyMsg = "Error técnico en la validación de IA.";
    
    // Diagnóstico basado en el mensaje de error del SDK
    if (!process.env.API_KEY) {
        userFriendlyMsg = "Error: Falta configurar la Llave de IA (API Key).";
    } else if (error.message?.includes("403") || error.message?.includes("API_KEY_INVALID")) {
        userFriendlyMsg = "Error: La Llave de IA es inválida o no tiene permisos.";
    } else if (error.message?.includes("429") || error.message?.includes("quota")) {
        userFriendlyMsg = "Error: Se ha excedido el límite de uso de la IA.";
    } else if (error.message?.includes("safety")) {
        userFriendlyMsg = "Error: La imagen fue bloqueada por filtros de seguridad.";
    }

    return { 
        identityMatch: false, 
        dressCodeMatches: false, 
        description: userFriendlyMsg, 
        confidence: 0 
    };
  }
};
