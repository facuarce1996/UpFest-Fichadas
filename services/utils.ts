
import { Location, User, LogEntry, Role, WorkSchedule, Incident } from "../types";
import { supabase } from "./supabaseClient";

const encodeOverrides = (feedback: string, start?: string | null, end?: string | null): string => {
  const cleanFeedback = feedback.split(' |||')[0];
  if (!start && !end) return cleanFeedback;
  return `${cleanFeedback} |||SCH_START:${start || ''}|SCH_END:${end || ''}|||`;
};

const decodeOverrides = (combinedText: string | null): { feedback: string, start?: string, end?: string } => {
  if (!combinedText) return { feedback: '' };
  const parts = combinedText.split(' |||');
  const feedback = parts[0];
  const overridePart = parts[1];
  if (!overridePart) return { feedback };
  const startMatch = overridePart.match(/SCH_START:([^|]*)/);
  const endMatch = overridePart.match(/SCH_END:([^|]*)/);
  return {
    feedback,
    start: startMatch ? startMatch[1] : undefined,
    end: endMatch ? endMatch[1] : undefined
  };
};

export const isWithinSchedule = (schedules: WorkSchedule[]): boolean => {
  if (!schedules || schedules.length === 0) return true;
  const now = new Date();
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const todayName = days[now.getDay()];
  const yesterdayName = days[(now.getDay() + 6) % 7];
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  return schedules.some(slot => {
    if (slot.day === todayName) {
      if (slot.start <= slot.end) return currentTime >= slot.start && currentTime <= slot.end;
      else return currentTime >= slot.start;
    }
    if (slot.day === yesterdayName && slot.start > slot.end) return currentTime <= slot.end;
    return false;
  });
};

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

export const getCurrentPosition = (): Promise<GeolocationPosition> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) reject(new Error("Geolocation not supported"));
    else navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true });
  });
};

const uploadBase64Image = async (base64Data: string, folder: string, customFileName?: string): Promise<string | null> => {
  try {
    const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const byteCharacters = atob(base64Clean);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/jpeg' });
    const fileName = customFileName || `${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
    const { error } = await supabase.storage.from('fichadas').upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });
    if (error) return null;
    const { data: publicUrlData } = supabase.storage.from('fichadas').getPublicUrl(fileName);
    return publicUrlData.publicUrl;
  } catch (error) { return null; }
};

const mapUserFromDB = (u: any): User => ({
  id: String(u.id),
  legajo: u.legajo || '',
  dni: u.dni,
  password: u.password,
  name: u.name,
  role: u.role as Role,
  dressCode: u.dress_code || '',
  referenceImage: u.reference_image || null,
  schedule: u.schedule || [],
  assignedLocations: u.assigned_locations || [],
  hourlyRate: u.hourly_rate || 0,
  email: u.email || '',
  phone: u.phone || '',
  hireDate: u.hire_date || '',
  workType: u.work_type || '',
  address: u.address || ''
});

const mapLocationFromDB = (l: any): Location => ({
  id: String(l.id),
  name: l.name,
  address: l.address || '',
  city: l.city || '',
  lat: l.lat,
  lng: l.lng,
  radiusMeters: l.radius_meters
});

const mapLogFromDB = (l: any): LogEntry => {
  const decoded = decodeOverrides(l.ai_feedback);
  return {
    id: String(l.id),
    userId: l.user_id,
    userName: l.user_name,
    legajo: l.legajo || '',
    timestamp: l.timestamp,
    type: l.type,
    locationId: l.location_id,
    locationName: l.location_name,
    locationStatus: l.location_status || 'SKIPPED',
    scheduleStatus: l.schedule_status,
    dressCodeStatus: l.dress_code_status || 'SKIPPED',
    identityStatus: l.identity_status || 'SKIPPED',
    photoEvidence: l.photo_evidence || '',
    aiFeedback: decoded.feedback || '',
    scheduledStartOverride: decoded.start,
    scheduledEndOverride: decoded.end
  };
};

export const fetchUsers = async (): Promise<User[]> => {
  const { data, error } = await supabase.from('users').select('*').order('name');
  if (error) return [];
  return data.map(mapUserFromDB);
};

export const saveUser = async (user: User) => {
  try {
    let referenceImageUrl = user.referenceImage;
    if (user.referenceImage && user.referenceImage.startsWith('data:image')) {
      const uploadedUrl = await uploadBase64Image(user.referenceImage, 'users', `${user.dni}_ref_${Date.now()}.jpg`);
      if (uploadedUrl) referenceImageUrl = uploadedUrl;
    }
    const dbUser: any = {
      dni: user.dni,
      password: user.password,
      name: user.name,
      role: user.role,
      legajo: user.legajo,
      dress_code: user.dressCode,
      reference_image: referenceImageUrl,
      schedule: user.schedule || [],
      email: user.email,
      phone: user.phone,
      hire_date: user.hireDate,
      work_type: user.workType,
      address: user.address,
      assigned_locations: user.assignedLocations || []
    };
    if (user.id && user.id !== "" && user.id !== "0") {
      const { error } = await supabase.from('users').update(dbUser).eq('id', user.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from('users').insert(dbUser);
      if (error) throw new Error(error.message);
    }
  } catch (err: any) { throw err; }
};

export const deleteUser = async (userId: string) => {
  const { error } = await supabase.from('users').delete().eq('id', userId);
  if (error) throw new Error(error.message);
}

export const fetchLocations = async (): Promise<Location[]> => {
  const { data, error } = await supabase.from('locations').select('*').order('name');
  if (error) return [];
  return data.map(mapLocationFromDB);
};

export const saveLocation = async (location: Location) => {
  const dbLocation = { name: location.name, address: location.address, city: location.city, lat: Number(location.lat), lng: Number(location.lng), radius_meters: Number(location.radiusMeters) };
  if (location.id && location.id !== "" && location.id !== "0") {
    const { error } = await supabase.from('locations').update(dbLocation).eq('id', location.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('locations').insert(dbLocation);
    if (error) throw new Error(error.message);
  }
};

export const deleteLocation = async (locId: string) => {
  const { error } = await supabase.from('locations').delete().eq('id', locId);
  if (error) throw new Error(error.message);
}

export const fetchLogsByDateRange = async (startDate: Date, endDate: Date): Promise<LogEntry[]> => {
    const { data, error } = await supabase.from('logs').select('*').gte('timestamp', startDate.toISOString()).lte('timestamp', endDate.toISOString()).order('timestamp', { ascending: false });
    if (error) return [];
    return data.map(mapLogFromDB);
};

export const fetchLastLog = async (userId: string): Promise<LogEntry | null> => {
    const { data, error } = await supabase.from('logs').select('*').eq('user_id', userId).order('timestamp', { ascending: false }).limit(1).maybeSingle();
    if (error || !data) return null;
    return mapLogFromDB(data);
};

export const updateLog = async (logId: string, updates: any) => {
  const { data: currentLog, error: fetchError } = await supabase.from('logs').select('ai_feedback').eq('id', logId).single();
  if (fetchError) throw new Error(fetchError.message);
  const dbUpdates: any = {};
  if (updates.timestamp) dbUpdates.timestamp = updates.timestamp;
  if (updates.scheduledStartOverride !== undefined || updates.scheduledEndOverride !== undefined) {
    const currentDecoded = decodeOverrides(currentLog.ai_feedback);
    dbUpdates.ai_feedback = encodeOverrides(currentDecoded.feedback, updates.scheduledStartOverride !== undefined ? updates.scheduledStartOverride : currentDecoded.start, updates.scheduledEndOverride !== undefined ? updates.scheduledEndOverride : currentDecoded.end);
  }
  const { error } = await supabase.from('logs').update(dbUpdates).eq('id', logId);
  if (error) throw new Error(error.message);
};

export const deleteLog = async (logId: string) => {
  const { error } = await supabase.from('logs').delete().eq('id', logId);
  if (error) throw new Error(error.message);
};

export const addLog = async (entry: LogEntry) => {
  let photoUrl = entry.photoEvidence;
  if (entry.photoEvidence && entry.photoEvidence.startsWith('data:image')) {
    const dateObj = new Date();
    const uploadedUrl = await uploadBase64Image(entry.photoEvidence, `evidence/${dateObj.getFullYear()}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`, `${entry.userName.replace(/\s+/g, '_')}_${entry.type}_${Date.now()}.jpg`);
    if (uploadedUrl) photoUrl = uploadedUrl;
  }
  const dbLog = { 
    user_id: entry.userId, 
    user_name: entry.userName, 
    legajo: entry.legajo, 
    timestamp: entry.timestamp, 
    type: entry.type, 
    location_id: entry.locationId, 
    location_name: entry.locationName, 
    location_status: entry.locationStatus, 
    schedule_status: entry.scheduleStatus, 
    dress_code_status: entry.dressCodeStatus, 
    identity_status: entry.identityStatus, 
    photo_evidence: photoUrl, 
    ai_feedback: encodeOverrides(entry.aiFeedback, entry.scheduledStartOverride, entry.scheduledEndOverride) 
  };
  const { error } = await supabase.from('logs').insert(dbLog);
  if (error) throw new Error(error.message);
};

export const fetchLogs = async (): Promise<LogEntry[]> => {
  const { data, error } = await supabase.from('logs').select('*').order('timestamp', { ascending: false }).limit(100);
  if (error) return [];
  return data.map(mapLogFromDB);
};

export const fetchCompanyLogo = async (): Promise<string | null> => {
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'company_logo').maybeSingle();
  return data ? data.value : null;
};

// --- Missing functions to fix App.tsx import errors ---

/**
 * Autentica un usuario verificando DNI y contraseña en Supabase.
 * Incluye acceso directo para admin/admin.
 */
export const authenticateUser = async (dni: string, password: string): Promise<User | null> => {
  // Validación especial para admin/admin
  if (dni === 'admin' && password === 'admin') {
    return {
      id: 'admin_session',
      dni: 'admin',
      legajo: 'ADM-001',
      password: 'admin',
      name: 'Administrador UpFest',
      role: 'Admin',
      dressCode: 'Libre',
      referenceImage: null,
      schedule: []
    };
  }

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('dni', dni)
    .eq('password', password)
    .maybeSingle();
  
  if (error || !data) return null;
  return mapUserFromDB(data);
};

/**
 * Obtiene las fichadas del día actual.
 */
export const fetchTodayLogs = async (): Promise<LogEntry[]> => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  return fetchLogsByDateRange(startOfDay, endOfDay);
};

/**
 * Guarda o actualiza el logo de la empresa en la tabla app_settings.
 */
export const saveCompanyLogo = async (url: string) => {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'company_logo', value: url }, { onConflict: 'key' });
  
  if (error) throw new Error(error.message);
};

/**
 * Calcula la diferencia entre la hora actual y la programada en el calendario.
 */
export const getScheduleDelayInfo = (schedule: WorkSchedule, type: 'CHECK_IN' | 'CHECK_OUT'): string => {
  const now = new Date();
  const targetTime = type === 'CHECK_IN' ? schedule.start : schedule.end;
  if (!targetTime || targetTime === '--:--') return "";
  const [h, m] = targetTime.split(':').map(Number);
  const target = new Date();
  target.setHours(h, m, 0, 0);
  const diffMs = now.getTime() - target.getTime();
  const diffMins = Math.abs(Math.round(diffMs / 60000));
  if (type === 'CHECK_IN') {
    return diffMs > 0 ? `Ingreso con ${diffMins} min de retraso` : `Ingreso con ${diffMins} min de antelación`;
  } else {
    return diffMs < 0 ? `Salida con ${diffMins} min de antelación` : `Salida con ${diffMins} min de demora`;
  }
};
