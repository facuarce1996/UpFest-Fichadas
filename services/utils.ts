
import { toDate } from 'date-fns-tz';
import { supabase } from './supabaseClient';
import { User, Location, LogEntry, WorkSchedule } from '../types';

/**
 * Sube una imagen Base64 al storage de Supabase y devuelve la URL pública.
 */
export const uploadImage = async (base64: string, bucket: string, path: string): Promise<string> => {
  try {
    // 1. Limpiar el base64 de posibles prefijos
    const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
    
    // 2. Convertir a Uint8Array de forma segura
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // 3. Crear el Blob con el tipo MIME correcto
    const blob = new Blob([bytes], { type: 'image/jpeg' });

    // 4. Subir a Supabase
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, blob, {
        cacheControl: '3600',
        upsert: true,
        contentType: 'image/jpeg'
      });

    if (error) {
      console.error("Error de Supabase Storage:", error);
      throw new Error(`Error de Storage: ${error.message}`);
    }

    // 5. Obtener URL Pública
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(path);

    return publicUrl;
  } catch (err: any) {
    console.error("Error detallado en uploadImage:", err);
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
  const now = toDate(new Date(), { timeZone });
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const currentDay = days[now.getDay()];
  const currentTime = now.getHours() * 60 + now.getMinutes();

  return schedule.some(slot => {
    if (slot.startDay !== currentDay) return false;
    const [startH, startM] = slot.startTime.split(':').map(Number);
    const [endH, endM] = slot.endTime.split(':').map(Number);
    const start = startH * 60 + startM;
    const end = endH * 60 + endM;
    return currentTime >= start && currentTime <= end;
  });
};

export const fetchUsers = async (): Promise<User[]> => {
  const { data, error } = await supabase.from('users').select('*').order('name');
  if (error) throw error;
  return (data || []).map(u => ({
    id: u.id,
    dni: u.dni,
    name: u.name,
    role: u.role,
    legajo: u.legajo,
    password: u.password,
    dressCode: u.dress_code,
    photoRef: u.reference_image,
    schedule: u.schedule || [],
    assignedLocations: Array.isArray(u.assigned_locations) ? u.assigned_locations : [],
    isActive: u.is_active
  }));
};

export const fetchLocations = async (): Promise<Location[]> => {
  const { data, error } = await supabase.from('locations').select('*').order('name');
  if (error) throw error;
  return (data || []).map(l => ({
    id: l.id,
    name: l.name,
    address: l.address,
    city: l.city,
    lat: l.lat,
    lng: l.lng,
    radiusMeters: l.radius_meters
  }));
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
  identityStatus: l.identity_status || 'SKIPPED',
  scheduleStatus: l.schedule_status || 'OFF_SCHEDULE',
  photoEvidence: l.photo_evidence || '',
  aiFeedback: l.ai_feedback || ''
});

export const fetchLogs = async (): Promise<LogEntry[]> => {
  const timeZone = 'America/Argentina/Buenos_Aires';
  
  const tryFetch = async (days: number) => {
    const rangeDate = toDate(new Date(), { timeZone });
    rangeDate.setDate(rangeDate.getDate() - days);
    rangeDate.setHours(0, 0, 0, 0);

    return await supabase
      .from('logs')
      .select('*')
      .gte('timestamp', rangeDate.toISOString())
      .order('timestamp', { ascending: false })
      .limit(1000);
  };

  try {
    // Intentar primero con 7 días
    let { data, error, status } = await tryFetch(7);
    
    // Si falla por timeout, intentar con un rango más corto (3 días)
    if (error && (error.message.includes('timeout') || status === 500)) {
      console.warn("Fetch de 7 días falló por timeout, intentando con 3 días...");
      const retry = await tryFetch(3);
      data = retry.data;
      error = retry.error;
      status = retry.status;
    }
    
    if (error) {
      console.error("Error de Supabase:", error);
      throw new Error(`Error ${status}: ${error.message}`);
    }

    if (!data || data.length === 0) {
      console.warn("Supabase devolvió 0 registros.");
    }

    return (data || []).map(mapLog);
  } catch (err: any) {
    console.error("Error crítico en fetchLogs:", err);
    throw err;
  }
};

export const fetchTodayLogs = async (): Promise<LogEntry[]> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from('logs')
    .select('*')
    .gte('timestamp', today.toISOString())
    .order('timestamp', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapLog);
};

export const fetchLogsByDateRange = async (start: Date, end: Date): Promise<LogEntry[]> => {
  try {
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error("Fechas inválidas proporcionadas al filtro.");
    }

    console.log(`Filtrando rango Supabase: ${start.toISOString()} hasta ${end.toISOString()}`);

    const { data, error, status } = await supabase
      .from('logs')
      .select('*')
      .gte('timestamp', start.toISOString())
      .lte('timestamp', end.toISOString())
      .order('timestamp', { ascending: false })
      .limit(1000);
    
    if (error) {
      console.error("Error de Supabase en rango:", error);
      throw new Error(`Error ${status}: ${error.message}`);
    }
    return (data || []).map(mapLog);
  } catch (err: any) {
    console.error("Error crítico en fetchLogsByDateRange:", err);
    throw err;
  }
};

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export const addLog = async (log: LogEntry): Promise<string> => {
  const newId = uuidv4();

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
    identity_status: log.identityStatus,
    schedule_status: log.scheduleStatus,
    photo_evidence: log.photoEvidence,
    ai_feedback: log.aiFeedback
  }]);
  if (error) throw error;
  return newId;
};

export const saveUser = async (user: User): Promise<void> => {
  let finalRefImage = user.photoRef;

  if (user.photoRef && user.photoRef.startsWith('data:image')) {
    const fileName = `users/${user.dni}_ref_${new Date().getTime()}.jpg`;
    finalRefImage = await uploadImage(user.photoRef, 'fichadas', fileName);
  }

  const payload = {
    dni: user.dni,
    name: user.name,
    role: user.role,
    legajo: user.legajo,
    password: user.password,
    dress_code: user.dressCode,
    reference_image: finalRefImage,
    schedule: user.schedule,
    assigned_locations: user.assignedLocations,
    is_active: user.isActive ?? true
  };
  
  if (user.id && user.id.length > 0) {
    const { error } = await supabase.from('users').update(payload).eq('id', user.id);
    if (error) throw error;
  } else {
    const newId = uuidv4();
    const { error } = await supabase.from('users').insert([{ ...payload, id: newId }]);
    if (error) throw error;
  }
};

export const deleteUser = async (id: string): Promise<void> => {
  const { error } = await supabase.from('users').delete().eq('id', id);
  if (error) throw error;
};

export const authenticateUser = async (dni: string): Promise<User | null> => {
  console.log("Iniciando autenticación para DNI:", dni);
  
  // Timeout de 10 segundos para evitar que la UI quede colgada si Supabase no responde
  const timeoutPromise = new Promise<null>((_, reject) => 
    setTimeout(() => reject(new Error("TIMEOUT_DB")), 10000)
  );

  try {
    const authPromise = (async () => {
      console.log("Llamando a Supabase select users...");
      const { data, error } = await supabase.from('users').select('*').eq('dni', dni).maybeSingle();
      console.log("Respuesta cruda de Supabase:", { data, error });
      if (error) {
        console.error("Error de Supabase en login:", error);
        return null;
      }
      return data;
    })();

    const data = await Promise.race([authPromise, timeoutPromise]);
    
    if (!data) {
      console.log("Usuario no encontrado o error en DB");
      return null;
    }
    
    if (!data.is_active) {
      console.log("Usuario desactivado");
      throw new Error("CUENTA DESACTIVADA");
    }
    
    console.log("Autenticación exitosa para:", data.name);
    return {
      id: data.id,
      dni: data.dni,
      name: data.name,
      role: data.role,
      legajo: data.legajo,
      password: data.password,
      dressCode: data.dress_code,
      photoRef: data.reference_image,
      schedule: data.schedule || [],
      assignedLocations: Array.isArray(data.assigned_locations) ? data.assigned_locations : [],
      isActive: data.is_active
    };
  } catch (err: any) {
    console.error("Excepción en authenticateUser:", err);
    if (err.message === "TIMEOUT_DB") {
      throw new Error("La base de datos no responde. Reintenta en unos segundos.");
    }
    throw err;
  }
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
    const { error } = await supabase.from('locations').insert([{ ...payload, id: uuidv4() }]);
    if (error) throw error;
  }
};

export const deleteLocation = async (id: string): Promise<void> => {
  const { error } = await supabase.from('locations').delete().eq('id', id);
  if (error) throw error;
};

export const fetchCompanyLogo = async (): Promise<string | null> => {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'company_logo').maybeSingle();
  if (error) return null;
  return data?.value || null;
};

export const saveCompanyLogo = async (logoUrl: string): Promise<void> => {
  const { error } = await supabase.from('app_settings').upsert({ key: 'company_logo', value: logoUrl });
  if (error) throw error;
};

export const fetchLastLog = async (userId: string): Promise<LogEntry | null> => {
  const { data, error } = await supabase.from('logs').select('*').eq('user_id', userId).order('timestamp', { ascending: false }).limit(1).maybeSingle();
  if (error) return null;
  return data ? mapLog(data) : null;
};

export const updateLog = async (log: LogEntry): Promise<void> => {
  const { error } = await supabase.from('logs').update({
    timestamp: log.timestamp,
    type: log.type,
    location_id: log.locationId,
    location_name: log.locationName,
    location_status: log.locationStatus,
    dress_code_status: log.dressCodeStatus,
    identity_status: log.identityStatus,
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
      setTimeout(() => reject(new Error("TIMEOUT")), 5000)
    );
    const healthPromise = supabase.from('users').select('count', { count: 'exact', head: true });
    
    const { error } = await Promise.race([healthPromise, timeoutPromise]) as any;
    return !error;
  } catch (e) {
    console.error("Health check falló:", e);
    return false;
  }
};
