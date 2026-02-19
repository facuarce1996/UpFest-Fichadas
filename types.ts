
export type Role = 'Admin' | 'Mozo' | 'Bartender' | 'Seguridad' | 'Limpieza' | 'Recepcionista';

export interface WorkSchedule {
  startDay: string;
  startTime: string;
  endDay: string;
  endTime: string;
}

export interface Incident {
  id: string;
  timestamp: string;
  type: string;
  description: string;
  resolved: boolean;
}

export interface Location {
  id: string;
  name: string;
  address: string;
  city?: string;
  lat: number;
  lng: number;
  radiusMeters: number;
}

export interface User {
  id: string;
  dni: string;
  name: string;
  role: Role;
  legajo: string;
  password?: string;
  dressCode: string;
  referenceImage: string | null;
  schedule: WorkSchedule[];
  assignedLocations?: string[];
  isActive?: boolean;
}

export interface LogEntry {
  id: string;
  userId: string;
  userName: string;
  legajo: string;
  timestamp: string;
  type: 'CHECK_IN' | 'CHECK_OUT';
  locationId: string;
  locationName: string;
  locationStatus: 'VALID' | 'INVALID' | 'SKIPPED';
  dressCodeStatus: 'PASS' | 'FAIL' | 'SKIPPED';
  identityStatus: 'MATCH' | 'NO_MATCH' | 'SKIPPED';
  scheduleStatus?: 'ON_TIME' | 'OFF_SCHEDULE';
  photoEvidence: string;
  aiFeedback: string;
}

export interface ValidationResult {
  identityMatch: boolean;
  dressCodeMatches: boolean;
  description: string;
}

export const DEFAULT_ROLES: Role[] = ['Admin', 'Mozo', 'Bartender', 'Seguridad', 'Limpieza', 'Recepcionista'];
export const DAYS_OF_WEEK = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
