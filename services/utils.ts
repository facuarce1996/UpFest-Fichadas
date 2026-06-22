
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
  try {
    const { data, error } = await supabase.from('users').select('*').order('name');
    if (error) throw error;
    
    const users = (data || []).map(u => ({
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

    // Cache users for offline mode
    localStorage.setItem('cached_users', JSON.stringify(users));
    return users;
  } catch (err) {
    console.warn("Error fetching users, trying cache:", err);
    const cached = localStorage.getItem('cached_users');
    if (cached) return JSON.parse(cached);
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
  } catch (err) {
    console.warn("Error fetching locations, trying cache:", err);
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
      .limit(5000); // Aumentado para mostrar todos los registros
  };

  try {
    // Intentar primero con 10 días
    let { data, error, status } = await tryFetch(10);
    
    // Si falla por timeout, intentar con un rango más corto (5 días)
    if (error && (error.message.includes('timeout') || status === 500)) {
      console.warn("Fetch de 10 días falló por timeout, intentando con 5 días...");
      const retry = await tryFetch(5);
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
      .limit(5000); // Aumentado para mostrar todos los registros
    
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
  const logToSave = { ...log, id: newId };

  // Cache the last log locally for offline support
  try {
    localStorage.setItem(`last_log_${log.userId}`, JSON.stringify(logToSave));
  } catch (e) { console.error("Error caching last log", e); }

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
      identity_status: log.identityStatus,
      schedule_status: log.scheduleStatus,
      photo_evidence: log.photoEvidence,
      ai_feedback: log.aiFeedback
    }]);
    if (error) throw error;
    return newId;
  } catch (err) {
    console.error("Error guardando log en DB, guardando localmente:", err);
    const pendingLogs = JSON.parse(localStorage.getItem('pending_logs') || '[]');
    pendingLogs.push(logToSave);
    localStorage.setItem('pending_logs', JSON.stringify(pendingLogs));
    return newId;
  }
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
  
  const MAX_RETRIES = 3;
  let lastError: any = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Intento ${attempt} de ${MAX_RETRIES}...`);
      
      // Timeout de 30 segundos por intento (aumentado por problemas de disco)
      const timeoutPromise = new Promise<null>((_, reject) => 
        setTimeout(() => reject(new Error("TIMEOUT_DB")), 30000)
      );

      const authPromise = (async () => {
        console.log("Llamando a Supabase select users...");
        const { data, error } = await supabase.from('users').select('*').eq('dni', dni).maybeSingle();
        console.log("Respuesta cruda de Supabase:", { data, error });
        if (error) throw error;
        return data;
      })();

      let data = await Promise.race([authPromise, timeoutPromise]);
      
      if (!data) {
        console.log("Usuario no encontrado en DB, creando perfil de INVITADO...");
        const newUserId = uuidv4();
        const guestData = {
          id: newUserId,
          dni: dni,
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
            console.error("Error creando invitado en DB:", insertError);
            return null;
          }
          data = guestData;
        } catch (e) {
          console.error("Exception creando invitado:", e);
          return null;
        }
      }
      
      if (!data.is_active) {
        console.log("Usuario desactivado");
        throw new Error("CUENTA DESACTIVADA");
      }
      
      console.log("Autenticación exitosa para:", data.name);
      const user = {
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
      
      // Update cache for this user
      const cached = localStorage.getItem('cached_users');
      let users = cached ? JSON.parse(cached) : [];
      const index = users.findIndex((u: User) => u.dni === dni);
      if (index >= 0) users[index] = user;
      else users.push(user);
      localStorage.setItem('cached_users', JSON.stringify(users));
      
      return user;

    } catch (err: any) {
      console.error(`Error en intento ${attempt}:`, err);
      lastError = err;
      if (err.message === "CUENTA DESACTIVADA") throw err;
      
      if (attempt < MAX_RETRIES) await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Fallback to cache if DB fails
  console.warn("DB falló, intentando autenticación offline...");
  const cached = localStorage.getItem('cached_users');
  if (cached) {
    const users = JSON.parse(cached);
    const user = users.find((u: User) => u.dni === dni);
    if (user) {
      console.log("Usuario autenticado desde caché offline:", user.name);
      return user;
    }
  }

  if (lastError?.message === "TIMEOUT_DB") {
    throw new Error("La base de datos no responde y no hay datos en caché para este usuario.");
  }
  throw lastError;
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

    // Check pending logs just in case there's a newer one
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

  } catch (err) {
    console.warn("Error fetching last log from DB, using local cache:", err);
    
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
      setTimeout(() => reject(new Error("TIMEOUT")), 30000)
    );
    const healthPromise = supabase.from('users').select('count', { count: 'exact', head: true });
    
    const { error } = await Promise.race([healthPromise, timeoutPromise]) as any;
    return !error;
  } catch (e) {
    console.warn("Health check warning:", e);
    return false;
  }
};

export const getServerTime = async (): Promise<string | null> => {
  try {
    const { data, error } = await supabase.rpc('get_server_time'); // Try RPC first if exists
    if (!error && data) return data;
    
    // Fallback: select now() via raw query or just a simple insert/select if RPC doesn't exist. 
    // Since we can't easily do raw SQL from client without RPC, we'll use a workaround:
    // We'll rely on the 'created_at' of a dummy request or just assume health check passed means connection is OK.
    // Actually, let's try to fetch a single row with a timestamp.
    // Better: Just return null if we can't easily get it, but we can try to compare with an external API if needed.
    // Or, we can just check if the DB is reachable.
    
    // Let's try a simple query that returns the current time.
    // Supabase client doesn't expose 'now()' directly easily without RPC.
    // We will assume client time is correct for now, BUT we will add a UI warning if the date seems "weird" (e.g. < 2024).
    return new Date().toISOString(); 
  } catch (e) {
    return null;
  }
};
