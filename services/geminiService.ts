

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
      description: "Verdadero si el rostro en la foto actual coincide con el de la foto de referencia.",
    },
    dressCodeMatches: {
      type: Type.BOOLEAN,
      description: "Verdadero si la vestimenta cumple con el código descrito.",
    },
    description: {
      type: Type.STRING,
      description: "Breve resumen del análisis.",
    },
    confidence: {
      type: Type.NUMBER,
      description: "Nivel de confianza entre 0 y 1.",
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
    // FIX: Using 'gemini-3-flash-preview' for robust multimodal analysis and improved reliability.
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

    const prompt = `Supervisor UpFest: Analiza esta fichada.
      1. ROSTRO: ${refBase64 ? 'Compara con la foto de referencia.' : 'Verifica rostro humano visible.'}
      2. VESTIMENTA: ¿Cumple con "${dressCodeDescription || 'Uniforme estándar'}"?
      Responde SOLO en JSON.`;

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

    // FIX: Accessing .text as a property, not a method, as per SDK guidelines.
    const resultText = response.text?.trim();
    if (!resultText) throw new Error("Respuesta vacía");
    
    return JSON.parse(resultText);
  } catch (error: any) {
    console.error("AI Error:", error);
    
    let msg = "Error en el servidor de Inteligencia Artificial.";
    if (error.message?.includes("403") || error.message?.includes("API_KEY_INVALID") || error.message?.includes("permission")) {
        msg = "Error: La Llave de IA no tiene permisos o es inválida.";
    } else if (error.message?.includes("429")) {
        msg = "Error: Límite de uso excedido (Cuota).";
    }

    return { 
        identityMatch: false, 
        dressCodeMatches: false, 
        description: msg, 
        confidence: 0 
    };
  }
};