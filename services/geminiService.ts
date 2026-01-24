
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
      description: "Verdadero si el rostro coincide con la referencia (si existe) o si hay un rostro claro.",
    },
    dressCodeMatches: {
      type: Type.BOOLEAN,
      description: "Verdadero si la vestimenta cumple el código solicitado.",
    },
    description: {
      type: Type.STRING,
      description: "Resumen breve del análisis realizado.",
    },
    confidence: {
      type: Type.NUMBER,
      description: "Confianza del análisis entre 0 y 1.",
    },
  },
  required: ["identityMatch", "dressCodeMatches", "description", "confidence"],
};

export const analyzeCheckIn = async (
  checkInImage: string,
  dressCodeDescription: string,
  referenceImage: string | null
): Promise<ValidationResult> => {
  const MAX_RETRIES = 2;
  let attempt = 0;

  const executeAnalysis = async (): Promise<ValidationResult> => {
    // Inicializar el cliente justo antes de usarlo para obtener la API_KEY más reciente
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
      throw new Error("La imagen capturada está vacía o es inválida.");
    }

    // Prompt optimizado para modelos de visión Gemini 3
    const prompt = `Actúa como un supervisor de seguridad y RRHH de UpFest.
      Analiza las imágenes adjuntas siguiendo estas reglas estrictas:
      1. IDENTIDAD: ${refBase64 ? 'Compara la primera imagen (referencia) con la segunda (fichada actual). ¿Es la misma persona?' : 'Verifica si hay un rostro humano visible y claro en la imagen.'}
      2. VESTIMENTA: El código requerido es "${dressCodeDescription || 'Uniforme estándar'}". ¿La persona cumple con este código?
      Responde únicamente en formato JSON válido según el esquema proporcionado.`;

    // Primero la referencia si existe
    if (refBase64) {
      parts.push({ inlineData: { mimeType: "image/jpeg", data: refBase64 } });
    }
    
    // Luego la captura actual
    parts.push({ inlineData: { mimeType: "image/jpeg", data: checkInBase64 } });
    
    // Finalmente el texto
    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents: { parts: parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: validationSchema,
        temperature: 0.1,
        // Desactivamos el pensamiento (thinking) para esta tarea de visión para mejorar latencia y evitar errores de cuota
        thinkingConfig: { thinkingBudget: 0 }
      },
    });

    const resultText = response.text?.trim();
    if (!resultText) throw new Error("La IA devolvió una respuesta vacía.");
    
    try {
      return JSON.parse(resultText);
    } catch (e) {
      console.error("Error parseando JSON de IA:", resultText);
      throw new Error("Respuesta de IA malformada.");
    }
  };

  while (attempt <= MAX_RETRIES) {
    try {
      return await executeAnalysis();
    } catch (error: any) {
      console.error(`Intento ${attempt + 1} fallido:`, error);
      
      const errorMsg = error?.message || "";
      const isRecoverable = errorMsg.includes("503") || errorMsg.includes("overloaded") || errorMsg.includes("429");

      if (isRecoverable && attempt < MAX_RETRIES) {
        attempt++;
        const delay = 1000 * attempt;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Proporcionar un mensaje de error más descriptivo según la causa real
      let finalMsg = "Error en el servidor de Inteligencia Artificial.";
      if (errorMsg.includes("API_KEY_INVALID") || errorMsg.includes("403")) {
          finalMsg = "Error de Autenticación: API Key no válida o expirada.";
      } else if (errorMsg.includes("429")) {
          finalMsg = "Límite de cuota de IA alcanzado. Por favor, espere un momento.";
      } else if (errorMsg.includes("SAFETY")) {
          finalMsg = "La imagen fue rechazada por los filtros de seguridad de la IA.";
      } else if (errorMsg.includes("Requested entity was not found")) {
          finalMsg = "Error de configuración de IA: Modelo no encontrado o llave sin acceso.";
      } else if (errorMsg.includes("400")) {
          finalMsg = "Error en el formato de imagen. Intente capturar nuevamente.";
      }

      return { 
          identityMatch: false, 
          dressCodeMatches: false, 
          description: finalMsg, 
          confidence: 0 
      };
    }
  }

  return { 
    identityMatch: false, 
    dressCodeMatches: false, 
    description: "No se pudo establecer comunicación con la IA tras varios reintentos.", 
    confidence: 0 
  };
};
