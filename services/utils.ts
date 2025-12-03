import { Location, User, LogEntry, Role, WorkSchedule } from "../types";

// --- Time & Schedule Helpers ---

export const isWithinSchedule = (schedules: WorkSchedule[]): boolean => {
  if (!schedules || schedules.length === 0) return true; // Si no tiene horario, se asume libre.

  const now = new Date();
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const todayName = days[now.getDay()];
  const yesterdayName = days[(now.getDay() + 6) % 7];
  
  const currentHours = now.getHours().toString().padStart(2, '0');
  const currentMinutes = now.getMinutes().toString().padStart(2, '0');
  const currentTime = `${currentHours}:${currentMinutes}`;

  return schedules.some(slot => {
    // Caso 1: El turno es hoy y no cruza medianoche (Ej: 09:00 a 18:00)
    // O el turno es hoy y cruza medianoche (Ej: 20:00 a 04:00), estamos en la parte inicial (20:00 a 23:59)
    if (slot.day === todayName) {
      if (slot.start <= slot.end) {
        // Horario normal
        return currentTime >= slot.start && currentTime <= slot.end;
      } else {
        // Cruza medianoche (ej 22:00 - 06:00), checkear parte pre-medianoche
        return currentTime >= slot.start;
      }
    }

    // Caso 2: El turno empezó ayer y cruzó medianoche (Ej: Ayer 20:00 a Hoy 04:00)
    if (slot.day === yesterdayName) {
      if (slot.start > slot.end) {
        // Es un turno nocturno que termina hoy
        return currentTime <= slot.end;
      }
    }

    return false;
  });
};

// --- Geolocation ---

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

export const getCurrentPosition = (): Promise<GeolocationPosition> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by your browser"));
    } else {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      });
    }
  });
};

// --- Storage (Mock Database) ---

// VERSION v8 TO RESET DATA WITH NEW STRUCTURE
const KEYS = {
  USERS: 'upfest_users_v7', 
  LOCATIONS: 'upfest_locations_v3', // Bumped for new address fields
  LOGS: 'upfest_logs_v7',
  LOGO: 'upfest_company_logo_v2'
};

// Seed Data
const DEFAULT_LOCATIONS: Location[] = [
  { id: 'central', name: 'Sucursal Central Obelisco', address: 'Av. 9 de Julio 1000', city: 'CABA', lat: -34.6037, lng: -58.3816, radiusMeters: 100 },
  { id: 'hall_1', name: 'Salón Versalles', address: 'Av. Libertador 4500', city: 'Palermo', lat: -34.5800, lng: -58.4200, radiusMeters: 50 },
  { id: 'hall_2', name: 'Palacio Leloir', address: 'Martín Fierro 3200', city: 'Ituzaingó', lat: -34.6000, lng: -58.5000, radiusMeters: 75 },
];

const DEFAULT_USERS: User[] = [
  { 
    id: 'u_admin_gen', 
    legajo: 'ADM-001',
    dni: 'admin', 
    password: 'admin', 
    name: 'Admin General', 
    role: Role.ADMIN, 
    dressCode: 'Casual de negocios.',
    referenceImage: null,
    assignedLocations: ['central', 'hall_1', 'hall_2'],
    schedule: [
      { day: 'Lunes', start: '09:00', end: '18:00' },
      { day: 'Martes', start: '09:00', end: '18:00' },
      { day: 'Miércoles', start: '09:00', end: '18:00' },
      { day: 'Jueves', start: '09:00', end: '18:00' },
      { day: 'Viernes', start: '09:00', end: '18:00' },
    ]
  },
  { 
    id: 'u_auditor', 
    legajo: 'AUD-204',
    dni: 'auditor', 
    password: '123', 
    name: 'Juan Perez', 
    role: Role.OTHER, 
    dressCode: 'Uniforme de Staff.',
    referenceImage: null,
    assignedLocations: ['central'],
    schedule: [
      { day: 'Viernes', start: '20:00', end: '04:00' },
      { day: 'Sábado', start: '20:00', end: '04:00' }
    ]
  },
];

export const getStoredUsers = (): User[] => {
  const stored = localStorage.getItem(KEYS.USERS);
  if (!stored) {
    localStorage.setItem(KEYS.USERS, JSON.stringify(DEFAULT_USERS));
    return DEFAULT_USERS;
  }
  return JSON.parse(stored);
};

export const saveUser = (user: User) => {
  const users = getStoredUsers();
  const index = users.findIndex(u => u.id === user.id);
  if (index >= 0) users[index] = user;
  else users.push(user);
  localStorage.setItem(KEYS.USERS, JSON.stringify(users));
};

export const deleteUser = (userId: string) => {
  const users = getStoredUsers().filter(u => u.id !== userId);
  localStorage.setItem(KEYS.USERS, JSON.stringify(users));
}

export const getStoredLocations = (): Location[] => {
  const stored = localStorage.getItem(KEYS.LOCATIONS);
  if (!stored) {
    localStorage.setItem(KEYS.LOCATIONS, JSON.stringify(DEFAULT_LOCATIONS));
    return DEFAULT_LOCATIONS;
  }
  return JSON.parse(stored);
};

export const saveLocation = (location: Location) => {
  const locs = getStoredLocations();
  const index = locs.findIndex(l => l.id === location.id);
  if (index >= 0) locs[index] = location;
  else locs.push(location);
  localStorage.setItem(KEYS.LOCATIONS, JSON.stringify(locs));
};

export const deleteLocation = (locId: string) => {
  const locs = getStoredLocations().filter(l => l.id !== locId);
  localStorage.setItem(KEYS.LOCATIONS, JSON.stringify(locs));
}

export const getLogs = (): LogEntry[] => {
  const stored = localStorage.getItem(KEYS.LOGS);
  return stored ? JSON.parse(stored) : [];
};

export const addLog = (entry: LogEntry) => {
  const logs = getLogs();
  logs.unshift(entry); // Newest first
  localStorage.setItem(KEYS.LOGS, JSON.stringify(logs));
};

export const deleteLog = (logId: string) => {
  const logs = getLogs().filter(l => l.id !== logId);
  localStorage.setItem(KEYS.LOGS, JSON.stringify(logs));
};

// --- Logo Management ---
export const getCompanyLogo = (): string | null => {
  return localStorage.getItem(KEYS.LOGO);
}

export const saveCompanyLogo = (base64: string) => {
  localStorage.setItem(KEYS.LOGO, base64);
}