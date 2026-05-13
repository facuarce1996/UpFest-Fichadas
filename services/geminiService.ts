import { GoogleGenAI, Type } from "@google/genai";
import { ValidationResult } from "../types";


// 🔴 SWITCH GLOBAL — CAMBIAR A true CUANDO QUIERAS REACTIVAR IA
const IA_ENABLED = true;


const responseSchema = {
  type: Type.OBJECT,
  properties: {
    identityMatch: { type: Type.BOOLEAN },
    dressCodeMatches: { type: Type.BOOLEAN },
    description: { type: Type.STRING },
  },
  required: ["identityMatch", "dressCodeMatches", "description"],
};


/**
 * Convierte una URL de imagen a Base64
 */
const imageUrlToBase64 = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve((reader.result as string).split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  } catch {
    return "";
  }
};


const cleanBase64 = (base64: string): string => {
  if (!base64) return "";
  const parts = base64.split(",");
  return parts.length > 1 ? parts[1] : parts[0];
};



export const analyzeCheckIn = async (
  currentPhotoBase64: string,
  dressCode: string,
  referencePhotoBase64: string | null
): Promise<ValidationResult> => {


  // 🟢 MODO SEGURO — IA DESACTIVADA
  if (!IA_ENABLED) {
    console.log("IA desactivada — se guarda fichada sin validación");

    return {
      identityMatch: true, // no bloquea
      dressCodeMatches: true, // no bloquea
      description: "Validación automática desactivada temporalmente"
    };
  }


  // 🔽 LLAMADA AL BACKEND PARA PROTEGER LA API KEY
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPhotoBase64, dressCode })
    });

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const data = await response.json();
    return {
      identityMatch: data.identityMatch ?? true,
      dressCodeMatches: data.dressCodeMatches ?? true,
      description: data.description ?? "Validación completada."
    };

  } catch (error: any) {
    console.error("Error al llamar al backend IA:", error);
    return {
      identityMatch: true,
      dressCodeMatches: true,
      description: `IA no disponible (${error.message || 'Error desconocido'}) — validación omitida`
    };
  }
};

export const validateEmployeePhoto = analyzeCheckIn;