
export type Role = string;

export const DEFAULT_ROLES = [
  'Admin',
  'Referente',
  'Seguridad',
  'Bartender',
  'Mozo',
  'Mozo Extra',
  'Secretaria',
  'Encargado',
  'Asesora',
  'Recepcionista',
  'Limpieza',
  'Bachero',
  'Chef',
  'Maitre',
  'Vendedor',
  'Parking',
  'Gerente',
  'Sala de juegos',
  'Guardarropa',
  'DJ',
  'Shows',
  'Mantenimiento'
];

export const DAYS_OF_WEEK = [
  'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'
];

export interface WorkSchedule {
  startDay: string;
  startTime: string;
  endDay: string;
  endTime: string;
}

export interface Location {
  id: string;
  name: string;
  address: string; 
  city: string;    
  lat: number;
  lng: number;
  radiusMeters: number;
}

export interface User {
  id: string;
  legajo: string;      
  dni: string;
  password: string;
  name: string;
  role: Role;
  dressCode: string;   
  referenceImage: string | null; 
  schedule: WorkSchedule[]; 
  assignedLocations?: string[];
  hourlyRate?: number;
  email?: string;
  phone?: string;
  hireDate?: string;
  workType?: string;
  address?: string;
}

export interface LogEntry {
  id: string;
  userId: string;
  userName: string;
  legajo: string;      
  timestamp: string;
  type: 'CHECK_IN' | 'CHECK_OUT' | 'BLOCKED';
  locationId: string;
  locationName: string;
  locationStatus: 'VALID' | 'INVALID' | 'SKIPPED';
  scheduleStatus?: 'ON_TIME' | 'OFF_SCHEDULE';
  dressCodeStatus: 'PASS' | 'FAIL' | 'SKIPPED';
  identityStatus: 'MATCH' | 'NO_MATCH' | 'NO_REF' | 'SKIPPED'; 
  photoEvidence: string;
  aiFeedback: string;
  scheduledStartOverride?: string; 
  scheduledEndOverride?: string;
}

export interface Incident {
  id: string;
  userId: string;
  date: string;
  type: 'LATE' | 'ABSENCE' | 'DISCOUNT' | 'BONUS' | 'DAMAGE';
  amount: number;
  description: string;
}

export interface ValidationResult {
  identityMatch: boolean;
  dressCodeMatches: boolean;
  description: string;
  confidence: number;
}
