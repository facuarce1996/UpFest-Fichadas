import { ValidationResult } from "../types";

// 🔴 SWITCH GLOBAL — CAMBIAR A true CUANDO QUIERAS REACTIVAR IA
const IA_ENABLED = true;


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