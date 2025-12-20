
export enum Role {
  ADMIN = 'Admin',
  WAITER = 'Mozo',
  EXTRA_WAITER = 'Mozo Extra',
  KITCHEN = 'Cocina',
  SECURITY = 'Seguridad',
  OTHER = 'Otro'
}

export interface WorkSchedule {
  day: string; // e.g. "Lunes"
  start: string; // "20:00"
  end: string;   // "04:00"
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
  hourlyRate?: number; // Nuevo: Tarifa por hora
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
}

export interface Incident {
  id: string;
  userId: string;
  date: string;
  type: 'LATE' | 'ABSENCE' | 'DISCOUNT' | 'BONUS' | 'DAMAGE';
  amount: number; // Monto a sumar o restar
  description: string;
}

export interface ValidationResult {
  identityMatch: boolean;
  dressCodeMatches: boolean;
  description: string;
  confidence: number;
}
