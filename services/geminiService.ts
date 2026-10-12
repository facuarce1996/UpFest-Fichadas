import { ValidationResult } from "../types";

// Switch global de IA
const IA_ENABLED = true;

export const analyzeCheckIn = async (
  currentPhotoBase64: string,
  dressCode: string,
  referencePhotoBase64?: string | null
): Promise<ValidationResult> => {

  // Modo seguro — IA desactivada
  if (!IA_ENABLED) {
    return {
      aiAvailable: false,
      identityMatch: true,
      dressCodeMatches: false,
      description: "Validación automática desactivada temporalmente"
    };
  }

  // Llamada al backend
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
      aiAvailable: data.aiAvailable ?? true,
      identityMatch: true,
      dressCodeMatches: data.dressCodeMatches ?? false,
      description: data.description ?? "Validación completada."
    };

  } catch (error: any) {
    console.error("Error al llamar al backend IA:", error.message || error);
    return {
      aiAvailable: false,
      identityMatch: true,
      dressCodeMatches: false,
      description: `IA no disponible (${error.message || 'Error de conexión'}) — validación omitida`
    };
  }
};

export const validateEmployeePhoto = analyzeCheckIn;
