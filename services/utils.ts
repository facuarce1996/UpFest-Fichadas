
import { supabase } from './supabaseClient';
import { User, Location, LogEntry, WorkSchedule } from '../types';

export const getCurrentPosition = (): Promise<GeolocationPosition> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 0
    });
  });
};

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in metres
};

export const isWithinSchedule = (schedule: WorkSchedule[]): boolean => {
  if (!schedule || schedule.length === 0) return true;
  const now = new Date();
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
  const { data, error } = await supabase.from('users').select('*');
  if (error) throw error;
  return (data || []).map(u => ({
    id: u.id,
    dni: u.dni,
    name: u.name,
    role: u.role,
    legajo: u.legajo,
    password: u.password,
    dressCode: u.dress_code,
    referenceImage: u.reference_image,
    schedule: u.schedule || [],
    assignedLocations: u.assigned_locations || [],
    isActive: u.is_active
  }));
};

export const fetchLocations = async (): Promise<Location[]> => {
  const { data, error } = await supabase.from('locations').select('*');
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
  id: l.id,
  userId: l.user_id,
  userName: l.user_name,
  legajo: l.legajo,
  timestamp: l.timestamp,
  type: l.type,
  locationId: l.location_id,
  locationName: l.location_name,
  locationStatus: l.location_status,
  dressCodeStatus: l.dress_code_status,
  identityStatus: l.identity_status,
  scheduleStatus: l.schedule_status,
  photoEvidence: l.photo_evidence,
  aiFeedback: l.ai_feedback
});

export const fetchLogs = async (): Promise<LogEntry[]> => {
  const { data, error } = await supabase.from('logs').select('*').order('timestamp', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapLog);
};

export const fetchTodayLogs = async (): Promise<LogEntry[]> => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { data, error } = await supabase.from('logs').select('*').gte('timestamp', start.toISOString()).order('timestamp', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapLog);
};

export const fetchLogsByDateRange = async (start: Date, end: Date): Promise<LogEntry[]> => {
  const { data, error } = await supabase.from('logs').select('*')
    .gte('timestamp', start.toISOString())
    .lte('timestamp', end.toISOString())
    .order('timestamp', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapLog);
};

export const addLog = async (log: LogEntry): Promise<void> => {
  const { error } = await supabase.from('logs').insert([{
    user_id: log.userId,
    user_name: log.userName,
    legajo: log.legajo,
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
  }]);
  if (error) throw error;
};

export const saveUser = async (user: User): Promise<void> => {
  const payload = {
    dni: user.dni,
    name: user.name,
    role: user.role,
    legajo: user.legajo,
    password: user.password,
    dress_code: user.dressCode,
    reference_image: user.referenceImage,
    schedule: user.schedule,
    assigned_locations: user.assignedLocations,
    is_active: user.isActive
  };
  if (user.id) {
    const { error } = await supabase.from('users').update(payload).eq('id', user.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('users').insert([payload]);
    if (error) throw error;
  }
};

export const deleteUser = async (id: string): Promise<void> => {
  const { error } = await supabase.from('users').delete().eq('id', id);
  if (error) throw error;
};

export const authenticateUser = async (dni: string): Promise<User | null> => {
  const { data, error } = await supabase.from('users').select('*').eq('dni', dni).single();
  if (error) return null;
  if (!data.is_active) throw new Error("CUENTA DESACTIVADA");
  return {
    id: data.id,
    dni: data.dni,
    name: data.name,
    role: data.role,
    legajo: data.legajo,
    password: data.password,
    dressCode: data.dress_code,
    referenceImage: data.reference_image,
    schedule: data.schedule || [],
    assignedLocations: data.assigned_locations || [],
    isActive: data.is_active
  };
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
  if (loc.id) {
    const { error } = await supabase.from('locations').update(payload).eq('id', loc.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('locations').insert([payload]);
    if (error) throw error;
  }
};

export const deleteLocation = async (id: string): Promise<void> => {
  const { error } = await supabase.from('locations').delete().eq('id', id);
  if (error) throw error;
};

export const fetchCompanyLogo = async (): Promise<string | null> => {
  const { data, error } = await supabase.from('settings').select('value').eq('key', 'company_logo').single();
  if (error) return null;
  return data?.value || null;
};

export const saveCompanyLogo = async (logoUrl: string): Promise<void> => {
  const { error } = await supabase.from('settings').upsert({ key: 'company_logo', value: logoUrl });
  if (error) throw error;
};

export const fetchLastLog = async (userId: string): Promise<LogEntry | null> => {
  const { data, error } = await supabase.from('logs').select('*').eq('user_id', userId).order('timestamp', { ascending: false }).limit(1).maybeSingle();
  if (error) return null;
  return data ? mapLog(data) : null;
};

export const updateLog = async (log: LogEntry): Promise<void> => {
  const { error } = await supabase.from('logs').update({
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
    const { error } = await supabase.from('users').select('count', { count: 'exact', head: true });
    return !error;
  } catch {
    return false;
  }
};
