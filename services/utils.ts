import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';
import { supabase } from './supabaseClient';
import { User, Location, LogEntry, WorkSchedule } from '../types';
import { analyzeCheckIn } from './geminiService';

export interface PendingPhoto {
  logId: string;
  userId: string;
  photoBase64: string;
  dressCode: string;
}

// Sanitizar caché inicial por si contenía contraseñas antiguas
try {
  const existingCache = localStorage.getItem('cached_users');
  if (existingCache) {
    const parsed = JSON.parse(existingCache);
    if (Array.isArray(parsed)) {
      const cleaned = parsed.map((u: any) => {
        const { password, ...rest } = u;
        return rest;
      });
      localStorage.setItem('cached_users', JSON.stringify(cleaned));
    }
  }
} catch (e) {}

/**
 * Comprime una imagen a máx dimension (ancho/alto) y calidad especificada para optimizar localStorage.
 */
export const compressImage = (base64: string, maxDim = 640, quality = 0.7): Promise<string> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof Image === 'undefined' || !base64) {
      return resolve(base64);
    }
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(base64);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(base64);
    img.src = base64;
  });
};

/**
 * Obtiene la hora confiable del servidor (/api/time con timeout de 2s).
 * Si falla, usa la hora del dispositivo indicando que es local.
 */
export const getReliableTime = async (): Promise<{ timestamp: string; isDeviceTime: boolean; diffMinutes: number }> => {
  const deviceNow = new Date();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const resp = await fetch('/api/time', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (resp.ok) {
      const data = await resp.json();
      if (data.now) {
        const serverNow = new Date(data.now);
        const diffMinutes = Math.abs(serverNow.getTime() - deviceNow.getTime()) / (1000 * 60);
        return {
          timestamp: serverNow.toISOString(),
          isDeviceTime: false,
          diffMinutes
        };
      }
    }
  } catch (e) {
    // Timeout o fallo de red
  }
  return {
    timestamp: deviceNow.toISOString(),
    isDeviceTime: true,
    diffMinutes: 0
  };
};

/**
 * Devuelve el total de fichadas pendientes de sincronizar (logs + fotos pendientes sin duplicar).
 */
export const getPendingSyncCount = (): number => {
  try {
    const pendingLogs: LogEntry[] = JSON.parse(localStorage.getItem('pending_logs') || '[]');
    const pendingPhotos: PendingPhoto[] = JSON.parse(localStorage.getItem('pending_photos') || '[]');
    const ids = new Set<string>();
    pendingLogs.forEach(l => { if (l.id) ids.add(l.id); });
    pendingPhotos.forEach(p => { if (p.logId) ids.add(p.logId); });
    return ids.size;
  } catch (e) {
    return 0;
  }
};

/**
 * Guarda una foto en la cola offline 'pending_photos' comprimida.
 */
export const queuePendingPhoto = async (item: { logId: string; userId: string; photoBase64: string; dressCode: string }): Promise<void> => {
  try {
    const compressed = await compressImage(item.photoBase64, 640, 0.7);
    const pendingPhotos: PendingPhoto[] = JSON.parse(localStorage.getItem('pending_photos') || '[]');
    if (!pendingPhotos.some(p => p.logId === item.logId)) {
      pendingPhotos.push({
        logId: item.logId,
        userId: item.userId,
        photoBase64: compressed,
        dressCode: item.dressCode
      });
      localStorage.setItem('pending_photos', JSON.stringify(pendingPhotos));
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pending-sync-updated'));
    }
  } catch (storageErr) {
    console.error("LocalStorage lleno o no disponible al encolar foto pendiente:", storageErr);
  }
};

let isSyncing = false;

/**
 * Sincroniza logs y fotos pendientes en localStorage con Supabase.
 */
export const syncPendingLogs = async (onSyncUpdate?: () => void): Promise<{ syncedLogs: number; syncedPhotos: number }> => {
  if (isSyncing) return { syncedLogs: 0, syncedPhotos: 0 };
  isSyncing = true;
  let syncedLogs = 0;
  let syncedPhotos = 0;

  try {
    // 1. Sincronizar fichadas offline (pending_logs)
    const pendingLogsRaw = localStorage.getItem('pending_logs');
    if (pendingLogsRaw) {
      const pendingLogs: LogEntry[] = JSON.parse(pendingLogsRaw);
      const remainingLogs: LogEntry[] = [];

      for (const log of pendingLogs) {
        try {
          const { error } = await supabase.from('logs').insert([{
            id: log.id,
            user_id: log.userId,
            user_name: log.userName,
            legajo: log.legajo,
            timestamp: log.timestamp,
            type: log.type,
            location_id: log.locationId,
            location_name: log.locationName,
            location_status: log.locationStatus,
            dress_code_status: log.dressCodeStatus,
            identity_status: 'SKIPPED',
            schedule_status: log.scheduleStatus,
            photo_evidence: log.photoEvidence,
            ai_feedback: log.aiFeedback
          }]);

          if (error) {
            // Si el error es de clave duplicada, considerarlo sincronizado
            if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('already exists') || error.message?.includes('unique constraint')) {
              syncedLogs++;
            } else {
              remainingLogs.push(log);
            }
          } else {
            syncedLogs++;
          }
        } catch (err) {
          remainingLogs.push(log);
        }
      }

      localStorage.setItem('pending_logs', JSON.stringify(remainingLogs));
    }

    // 2. Sincronizar fotos pendientes (pending_photos)
    const pendingPhotosRaw = localStorage.getItem('pending_photos');
    if (pendingPhotosRaw) {
      const pendingPhotos: PendingPhoto[] = JSON.parse(pendingPhotosRaw);
      const remainingPhotos: PendingPhoto[] = [];

      for (const item of pendingPhotos) {
        try {
          // Subir foto
          const timestamp = Date.now();
          const fileName = `logs/${item.userId}_${timestamp}.jpg`;
          const finalPhotoUrl = await uploadImage(item.photoBase64, 'fichadas', fileName);

          // Correr IA
          const iaResult = await analyzeCheckIn(item.photoBase64, item.dressCode, null);
          const dressCodeStatus = iaResult.aiAvailable ? (iaResult.dressCodeMatches ? 'PASS' : 'FAIL') : 'SKIPPED';

          // Actualizar log en base de datos
          const { error: updateError } = await supabase.from('logs').update({
            photo_evidence: finalPhotoUrl,
            dress_code_status: dressCodeStatus,
            identity_status: 'SKIPPED',
            ai_feedback: iaResult.description
          }).eq('id', item.logId);

          if (updateError) {
            remainingPhotos.push(item);
          } else {
            syncedPhotos++;
          }
        } catch (photoErr) {
          remainingPhotos.push(item);
        }
      }

      localStorage.setItem('pending_photos', JSON.stringify(remainingPhotos));
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pending-sync-updated'));
    }
    if (onSyncUpdate) onSyncUpdate();

  } catch (err: any) {
    console.error("Error en syncPendingLogs:", err.message || err);
  } finally {
    isSyncing = false;
  }

  return { syncedLogs, syncedPhotos };
};

/**
 * Sube una imagen Base64 al storage de Supabase y devuelve la URL pública.
 */
export const uploadImage = async (base64: string, bucket: string, path: string): Promise<string> => {
  try {
    const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const blob = new Blob([bytes], { type: 'image/jpeg' });

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, blob, {
        cacheControl: '3600',
        upsert: true,
        contentType: 'image/jpeg'
      });

    if (error) {
      console.error("Error de Supabase Storage:", error.message);
      throw new Error(`Error de Storage: ${error.message}`);
    }

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(path);

    return publicUrl;
  } catch (err: any) {
    console.error("Error en uploadImage:", err.message || "Error al subir imagen");
    throw new Error(err.message || "No se pudo subir la foto al servidor.");
  }
};

export const getCurrentPosition = (): Promise<GeolocationPosition> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 0
    });
  });
};

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3; 
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; 
};

export const isWithinSchedule = (schedule: WorkSchedule[]): boolean => {
  if (!schedule || schedule.length === 0) return true;
  const timeZone = 'America/Argentina/Buenos_Aires';
  
  // Obtener fecha/hora en Argentina usando date-fns-tz
  const now = new Date();
  const currentDayIndex = parseInt(formatInTimeZone(now, timeZone, 'i'), 10); // 1 = Lunes, ..., 7 = Domingo
  const dayIndexInWeek = currentDayIndex % 7; // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  const currentH = parseInt(formatInTimeZone(now, timeZone, 'H'), 10);
  const currentM = parseInt(formatInTimeZone(now, timeZone, 'm'), 10);
  const currentWeeklyMinute = dayIndexInWeek * 1440 + currentH * 60 + currentM;

  const dayNameToIndex: Record<string, number> = {
    'Domingo': 0,
    'Lunes': 1,
    'Martes': 2,
    'Miércoles': 3,
    'Miercoles': 3,
    'Jueves': 4,
    'Viernes': 5,
    'Sábado': 6,
    'Sabado': 6
  };

  return schedule.some(slot => {
    const startDayIdx = dayNameToIndex[slot.startDay];
    let endDayIdx = dayNameToIndex[slot.endDay];
    if (startDayIdx === undefined || endDayIdx === undefined) return false;

    const [startH, startM] = (slot.startTime || '00:00').split(':').map(Number);
    const [endH, endM] = (slot.endTime || '00:00').split(':').map(Number);

    const slotStartMinute = startDayIdx * 1440 + startH * 60 + startM;
    let slotEndMinute = endDayIdx * 1440 + endH * 60 + endM;

    // Si startDay === endDay pero endTime < startTime (ej: Sábado 20:00 a Sábado 04:00, cruza medianoche)
    if (startDayIdx === endDayIdx && (endH * 60 + endM) < (startH * 60 + startM)) {
      endDayIdx = (startDayIdx + 1) % 7;
      slotEndMinute = endDayIdx * 1440 + endH * 60 + endM;
    }

    if (slotEndMinute < slotStartMinute) {
      // Cruza el límite de la semana (ej: Sábado noche a Domingo madrugada)
      return currentWeeklyMinute >= slotStartMinute || currentWeeklyMinute <= slotEndMinute;
    } else {
      return currentWeeklyMinute >= slotStartMinute && currentWeeklyMinute <= slotEndMinute;
    }
  });
};

export const fetchUsers = async (): Promise<User[]> => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, dni, name, role, legajo, dress_code, reference_image, schedule, assigned_locations, is_active')
      .order('name');

    if (error) throw error;
    
    const users: User[] = (data || []).map(u => ({
      id: u.id,
      dni: u.dni,
      name: u.name,
      role: u.role,
      legajo: u.legajo,
      dressCode: u.dress_code,
      photoRef: u.reference_image,
      schedule: u.schedule || [],
      assignedLocations: Array.isArray(u.assigned_locations) ? u.assigned_locations : [],
      isActive: u.is_active
    }));

    // Cache users for offline mode (sin guardar contraseñas)
    localStorage.setItem('cached_users', JSON.stringify(users));
    return users;
  } catch (err: any) {
    console.error("Error al obtener usuarios:", err.message || err);
    const cached = localStorage.getItem('cached_users');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        return parsed.map((u: any) => {
          const { password, ...rest } = u;
          return rest;
        });
      } catch (e) {}
    }
    throw err;
  }
};

export const fetchLocations = async (): Promise<Location[]> => {
  try {
    const { data, error } = await supabase.from('locations').select('*').order('name');
    if (error) throw error;
    const locs = (data || []).map(l => ({
      id: l.id,
      name: l.name,
      address: l.address,
      city: l.city,
      lat: l.lat,
      lng: l.lng,
      radiusMeters: l.radius_meters
    }));
    localStorage.setItem('cached_locations', JSON.stringify(locs));
    return locs;
  } catch (err: any) {
    console.error("Error al obtener sedes:", err.message || err);
    const cached = localStorage.getItem('cached_locations');
    if (cached) return JSON.parse(cached);
    throw err;
  }
};

const mapLog = (l: any): LogEntry => ({
  id: l.id || '',
  userId: l.user_id || '',
  userName: l.user_name || 'Usuario Desconocido',
  legajo: l.legajo || '---',
  timestamp: l.timestamp || new Date().toISOString(),
  type: l.type || 'CHECK_IN',
  locationId: l.location_id || '',
  locationName: l.location_name || 'Ubicación Desconocida',
  locationStatus: l.location_status || 'SKIPPED',
  dressCodeStatus: l.dress_code_status || 'SKIPPED',
  identityStatus: 'SKIPPED',
  scheduleStatus: l.schedule_status || 'OFF_SCHEDULE',
  photoEvidence: l.photo_evidence || '',
  aiFeedback: l.ai_feedback || ''
});

export const fetchLogs = async (): Promise<LogEntry[]> => {
  const timeZone = 'America/Argentina/Buenos_Aires';
  
  const tryFetch = async (days: number) => {
    const zonedNow = toZonedTime(new Date(), timeZone);
    const targetDate = new Date(zonedNow);
    targetDate.setDate(targetDate.getDate() - days);
    const dateStr = formatInTimeZone(targetDate, timeZone, 'yyyy-MM-dd');
    const startOfRange = fromZonedTime(`${dateStr}T00:00:00`, timeZone);

    return await supabase
      .from('logs')
      .select('*')
      .gte('timestamp', startOfRange.toISOString())
      .order('timestamp', { ascending: false })
      .limit(5000);
  };

  try {
    let { data, error, status } = await tryFetch(10);
    
    if (error && (error.message.includes('timeout') || status === 500)) {
      const retry = await tryFetch(5);
      data = retry.data;
      error = retry.error;
      status = retry.status;
    }
    
    if (error) {
      console.error("Error de Supabase al consultar logs:", error.message);
      throw new Error(`Error ${status}: ${error.message}`);
    }

    return (data || []).map(mapLog);
  } catch (err: any) {
    console.error("Error crítico en fetchLogs:", err.message || err);
    throw err;
  }
};

export const fetchTodayLogs = async (): Promise<LogEntry[]> => {
  const timeZone = 'America/Argentina/Buenos_Aires';
  const todayStr = formatInTimeZone(new Date(), timeZone, 'yyyy-MM-dd');
  const startOfDay = fromZonedTime(`${todayStr}T00:00:00`, timeZone);

  const { data, error } = await supabase
    .from('logs')
    .select('*')
    .gte('timestamp', startOfDay.toISOString())
    .order('timestamp', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapLog);
};

export const fetchLogsByDateRange = async (start: Date, end: Date): Promise<LogEntry[]> => {
  try {
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error("Fechas inválidas proporcionadas al filtro.");
    }

    const { data, error, status } = await supabase
      .from('logs')
      .select('*')
      .gte('timestamp', start.toISOString())
      .lte('timestamp', end.toISOString())
      .order('timestamp', { ascending: false })
      .limit(5000);
    
    if (error) {
      console.error("Error de Supabase en rango de fechas:", error.message);
      throw new Error(`Error ${status}: ${error.message}`);
    }
    return (data || []).map(mapLog);
  } catch (err: any) {
    console.error("Error crítico en fetchLogsByDateRange:", err.message || err);
    throw err;
  }
};

export const addLog = async (log: LogEntry): Promise<string> => {
  const newId = log.id || crypto.randomUUID();
  const logToSave = { ...log, id: newId, identityStatus: 'SKIPPED' as const };

  try {
    localStorage.setItem(`last_log_${log.userId}`, JSON.stringify(logToSave));
  } catch (e) {
    console.error("Error guardando last log local:", e);
  }

  try {
    const { error } = await supabase.from('logs').insert([{
      id: newId,
      user_id: log.userId,
      user_name: log.userName,
      legajo: log.legajo,
      timestamp: log.timestamp || new Date().toISOString(),
      type: log.type,
      location_id: log.locationId,
      location_name: log.locationName,
      location_status: log.locationStatus,
      dress_code_status: log.dressCodeStatus,
      identity_status: 'SKIPPED',
      schedule_status: log.scheduleStatus,
      photo_evidence: log.photoEvidence,
      ai_feedback: log.aiFeedback
    }]);
    if (error) throw error;
    return newId;
  } catch (err: any) {
    console.error("Error guardando log en base de datos, guardando localmente en cola:", err.message || err);
    try {
      const pendingLogs = JSON.parse(localStorage.getItem('pending_logs') || '[]');
      if (!pendingLogs.some((l: any) => l.id === newId)) {
        pendingLogs.push(logToSave);
        localStorage.setItem('pending_logs', JSON.stringify(pendingLogs));
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pending-sync-updated'));
      }
    } catch (storageErr) {
      console.error("No se pudo guardar en pending_logs (localStorage lleno):", storageErr);
    }
    return newId;
  }
};

export const saveUser = async (user: User): Promise<void> => {
  let finalRefImage = user.photoRef;

  if (user.photoRef && user.photoRef.startsWith('data:image')) {
    const fileName = `users/${user.dni}_ref_${Date.now()}.jpg`;
    finalRefImage = await uploadImage(user.photoRef, 'fichadas', fileName);
  }

  const payload: any = {
    dni: user.dni,
    name: user.name,
    role: user.role,
    legajo: user.legajo,
    dress_code: user.dressCode,
    reference_image: finalRefImage,
    schedule: user.schedule,
    assigned_locations: user.assignedLocations,
    is_active: user.isActive ?? true
  };

  // En saveUser, si password viene vacío en una edición, no incluir la columna password en el update
  if (user.password && user.password.trim() !== '') {
    payload.password = user.password.trim();
  }
  
  if (user.id && user.id.length > 0) {
    const { error } = await supabase.from('users').update(payload).eq('id', user.id);
    if (error) throw error;
  } else {
    const newId = crypto.randomUUID();
    const { error } = await supabase.from('users').insert([{ ...payload, id: newId }]);
    if (error) throw error;
  }
};

export const deleteUser = async (id: string): Promise<void> => {
  const { error } = await supabase.from('users').delete().eq('id', id);
  if (error) throw error;
};

export const authenticateUser = async (
  dni: string, 
  isGuest: boolean = false, 
  password?: string
): Promise<User | null> => {
  const trimmedDni = (dni || '').trim();

  // Validar que el DNI sea numérico de 7 u 8 dígitos (ej: '00000000' pasa)
  const dniRegex = /^\d{7,8}$/;
  if (!dniRegex.test(trimmedDni)) {
    throw new Error("El DNI debe ser numérico de 7 u 8 dígitos");
  }

  let networkFailed = false;

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dni: trimmedDni, password: password ? password.trim() : undefined })
    });

    if (response.status === 200) {
      const data = await response.json();
      const user = data.user as User;
      
      // Actualizar usuario en caché local sin contraseña
      const { password: _, ...safeUser } = user as any;
      try {
        const cached = localStorage.getItem('cached_users');
        let users: User[] = cached ? JSON.parse(cached) : [];
        const index = users.findIndex((u: User) => u.dni === trimmedDni);
        if (index >= 0) users[index] = safeUser;
        else users.push(safeUser);
        localStorage.setItem('cached_users', JSON.stringify(users));
      } catch (e) {}

      return safeUser;
    }

    if (response.status === 404) {
      if (!isGuest) {
        return null;
      }

      // Modo invitado: crear perfil de invitado en Supabase
      const newUserId = crypto.randomUUID();
      const guestData = {
        id: newUserId,
        dni: trimmedDni,
        name: "Invitado",
        role: "Invitado",
        legajo: "INV",
        dress_code: "N/A",
        is_active: true,
        reference_image: null,
        password: "",
        schedule: [],
        assigned_locations: []
      };

      try {
        const { error: insertError } = await supabase.from('users').insert([guestData]);
        if (insertError) {
          console.error("Error creando invitado en base de datos:", insertError.message);
          return null;
        }
      } catch (e: any) {
        console.error("Excepción creando invitado:", e.message || e);
        return null;
      }

      const guestUser: User = {
        id: guestData.id,
        dni: guestData.dni,
        name: guestData.name,
        role: guestData.role,
        legajo: guestData.legajo,
        dressCode: guestData.dress_code,
        photoRef: null,
        schedule: [],
        assignedLocations: [],
        isActive: true
      };

      return guestUser;
    }

    if (response.status === 403) {
      throw new Error("CUENTA DESACTIVADA");
    }

    if (response.status === 401) {
      const data = await response.json().catch(() => ({}));
      const err: any = new Error(data.error || "Contraseña incorrecta");
      if (data.requirePassword) {
        err.requirePassword = true;
        err.role = data.role;
      }
      throw err;
    }

    if (response.status === 429) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Demasiados intentos. Espera un minuto.");
    }

    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Error del servidor (${response.status})`);

  } catch (err: any) {
    if (
      err.requirePassword || 
      err.message === "CUENTA DESACTIVADA" || 
      err.message === "El DNI debe ser numérico de 7 u 8 dígitos" || 
      err.message?.includes("Demasiados intentos") || 
      err.message === "Contraseña incorrecta"
    ) {
      throw err;
    }

    networkFailed = true;
  }

  // Fallback offline SOLO para empleados no-Admin si la red falló
  if (networkFailed) {
    const cached = localStorage.getItem('cached_users');
    if (cached) {
      try {
        const users: User[] = JSON.parse(cached);
        const user = users.find((u: User) => u.dni === trimmedDni);
        if (user) {
          if (user.role === 'Admin') {
            throw new Error("Los administradores no pueden iniciar sesión sin conexión.");
          }
          if (user.isActive === false) {
            throw new Error("CUENTA DESACTIVADA");
          }
          const { password: _, ...safeUser } = user as any;
          return safeUser;
        }
      } catch (e: any) {
        if (e.message?.includes("administradores") || e.message === "CUENTA DESACTIVADA") throw e;
      }
    }
    throw new Error("Error de conexión y no hay datos offline para este usuario.");
  }

  return null;
};

export const saveLocation = async (loc: Location): Promise<void> => {
  const payload = {
    name: loc.name,
    address: loc.address,
    city: loc.city,
    lat: loc.lat,
    lng: loc.lng,
    radius_meters: loc.radiusMeters
  };
  if (loc.id && loc.id.length > 0) {
    const { error } = await supabase.from('locations').update(payload).eq('id', loc.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('locations').insert([{ ...payload, id: crypto.randomUUID() }]);
    if (error) throw error;
  }
};

export const deleteLocation = async (id: string): Promise<void> => {
  const { error } = await supabase.from('locations').delete().eq('id', id);
  if (error) throw error;
};

export const fetchCompanyLogo = async (): Promise<string | null> => {
  try {
    const { data, error } = await supabase.from('company_settings').select('logo_url').maybeSingle();
    if (error) return null;
    return data?.logo_url || null;
  } catch(e) {
    return null;
  }
};

export const saveCompanyLogo = async (logoUrl: string): Promise<void> => {
  const { data } = await supabase.from('company_settings').select('id').maybeSingle();
  if (data?.id) {
    const { error } = await supabase.from('company_settings').update({ logo_url: logoUrl }).eq('id', data.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('company_settings').insert([{ logo_url: logoUrl }]);
    if (error) throw error;
  }
};

export const fetchLastLog = async (userId: string): Promise<LogEntry | null> => {
  try {
    const timeoutPromise = new Promise<null>((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 3000));
    const fetchPromise = supabase.from('logs').select('*').eq('user_id', userId).order('timestamp', { ascending: false }).limit(1).maybeSingle();
    
    const response = await Promise.race([fetchPromise, timeoutPromise]) as any;
    
    let dbLog = null;
    if (response && response.data) {
      dbLog = mapLog(response.data);
      localStorage.setItem(`last_log_${userId}`, JSON.stringify(dbLog));
    }

    const pendingLogs = JSON.parse(localStorage.getItem('pending_logs') || '[]');
    const userPendingLogs = pendingLogs.filter((l: any) => l.userId === userId || l.user_id === userId);
    let lastPendingLog = null;
    
    if (userPendingLogs.length > 0) {
      userPendingLogs.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      lastPendingLog = userPendingLogs[0];
      if (lastPendingLog.user_id) lastPendingLog = mapLog(lastPendingLog);
    }

    if (lastPendingLog && dbLog) {
      return new Date(lastPendingLog.timestamp).getTime() > new Date(dbLog.timestamp).getTime() ? lastPendingLog : dbLog;
    }
    
    return lastPendingLog || dbLog || null;

  } catch (err: any) {
    const pendingLogs = JSON.parse(localStorage.getItem('pending_logs') || '[]');
    const userPendingLogs = pendingLogs.filter((l: any) => l.userId === userId || l.user_id === userId);
    let lastPendingLog = null;
    if (userPendingLogs.length > 0) {
      userPendingLogs.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      lastPendingLog = userPendingLogs[0];
      if (lastPendingLog.user_id) lastPendingLog = mapLog(lastPendingLog);
    }

    const cachedLogStr = localStorage.getItem(`last_log_${userId}`);
    let cachedLog = null;
    if (cachedLogStr) {
      try { cachedLog = JSON.parse(cachedLogStr); } catch(e) {}
    }

    if (lastPendingLog && cachedLog) {
       return new Date(lastPendingLog.timestamp).getTime() > new Date(cachedLog.timestamp).getTime() ? lastPendingLog : cachedLog;
    }
    
    return lastPendingLog || cachedLog || null;
  }
};

export const updateLog = async (log: LogEntry): Promise<void> => {
  const { error } = await supabase.from('logs').update({
    timestamp: log.timestamp,
    type: log.type,
    location_id: log.locationId,
    location_name: log.locationName,
    location_status: log.locationStatus,
    dress_code_status: log.dressCodeStatus,
    identity_status: 'SKIPPED',
    schedule_status: log.scheduleStatus,
    photo_evidence: log.photoEvidence,
    ai_feedback: log.aiFeedback
  }).eq('id', log.id);
  if (error) throw error;
};

export const deleteLog = async (id: string): Promise<void> => {
  const { error } = await supabase.from('logs').delete().eq('id', id);
  if (error) throw error;
};

export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    const timeoutPromise = new Promise<null>((_, reject) => 
      setTimeout(() => reject(new Error("TIMEOUT")), 30000)
    );
    const healthPromise = supabase.from('users').select('count', { count: 'exact', head: true });
    
    const { error } = await Promise.race([healthPromise, timeoutPromise]) as any;
    return !error;
  } catch (e) {
    return false;
  }
};

export const getServerTime = async (): Promise<string | null> => {
  try {
    const { data, error } = await supabase.rpc('get_server_time');
    if (!error && data) return data;
    return new Date().toISOString(); 
  } catch (e) {
    return null;
  }
};
