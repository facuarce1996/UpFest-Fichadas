
import { Location, User, LogEntry, Role, WorkSchedule, Incident } from "../types";
import { supabase } from "./supabaseClient";

// --- Helpers para persistencia virtual en ai_feedback ---

const encodeOverrides = (feedback: string, start?: string | null, end?: string | null): string => {
  const cleanFeedback = feedback.split(' |||')[0]; // Limpiar overrides anteriores
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

// --- Time & Schedule Helpers ---

export const isWithinSchedule = (schedules: WorkSchedule[]): boolean => {
  if (!schedules || schedules.length === 0) return true;

  const now = new Date();
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const todayName = days[now.getDay()];
  const yesterdayName = days[(now.getDay() + 6) % 7];
  
  const currentHours = now.getHours().toString().padStart(2, '0');
  const currentMinutes = now.getMinutes().toString().padStart(2, '0');
  const currentTime = `${currentHours}:${currentMinutes}`;

  return schedules.some(slot => {
    if (slot.day === todayName) {
      if (slot.start <= slot.end) {
        return currentTime >= slot.start && currentTime <= slot.end;
      } else {
        return currentTime >= slot.start;
      }
    }
    if (slot.day === yesterdayName) {
      if (slot.start > slot.end) {
        return currentTime <= slot.end;
      }
    }
    return false;
  });
};

export const getScheduleDelayInfo = (schedules: WorkSchedule[]): string | null => {
    if (!schedules || schedules.length === 0) return null;

    const now = new Date();
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const todayName = days[now.getDay()];
    
    const todaySchedule = schedules.find(s => s.day === todayName);
    if (!todaySchedule) return null;

    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const [startHours, startMinutes] = todaySchedule.start.split(':').map(Number);
    
    const nowTotalMinutes = currentHours * 60 + currentMinutes;
    const startTotalMinutes = startHours * 60 + startMinutes;
    
    if (nowTotalMinutes > startTotalMinutes) {
        const diffMinutes = nowTotalMinutes - startTotalMinutes;
        const hoursLate = Math.floor(diffMinutes / 60);
        const minsLate = diffMinutes % 60;
        
        let delayText = "";
        if (hoursLate > 0) delayText += `${hoursLate} hrs `;
        delayText += `${minsLate} mins`;

        return `Horario asignado: ${todaySchedule.start}. Demora: ${delayText}`;
    }
    return null;
}

// --- Geolocation ---

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3;
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

// --- Storage Helpers ---

const uploadBase64Image = async (base64Data: string, folder: string, customFileName?: string): Promise<string | null> => {
  try {
    const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const byteCharacters = atob(base64Clean);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/jpeg' });

    const finalFileName = customFileName 
        ? `${folder}/${customFileName}`
        : `${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;

    const { error } = await supabase.storage
      .from('fichadas')
      .upload(finalFileName, blob, { contentType: 'image/jpeg', upsert: true });

    if (error) return null;

    const { data: publicUrlData } = supabase.storage
      .from('fichadas')
      .getPublicUrl(finalFileName);

    return publicUrlData.publicUrl;
  } catch (error) {
    console.error("Storage upload error:", error);
    return null;
  }
};

// --- Mapping Helpers ---

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
  hourlyRate: u.hourly_rate || 0
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
    locationStatus: l.location_status,
    scheduleStatus: l.schedule_status,
    dressCodeStatus: l.dress_code_status,
    identityStatus: l.identity_status,
    photoEvidence: l.photo_evidence,
    aiFeedback: decoded.feedback,
    scheduledStartOverride: decoded.start,
    scheduledEndOverride: decoded.end
  };
};

// --- DATA OPERATIONS ---

export const fetchUsers = async (): Promise<User[]> => {
  const { data, error } = await supabase.from('users').select('*').order('name');
  if (error) return [];
  return data.map(mapUserFromDB);
};

export const saveUser = async (user: User) => {
  try {
    let referenceImageUrl = user.referenceImage;
    
    if (user.referenceImage && user.referenceImage.startsWith('data:image')) {
      const fileName = `${user.dni}_ref_${Date.now()}.jpg`;
      const uploadedUrl = await uploadBase64Image(user.referenceImage, 'users', fileName);
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
      schedule: user.schedule || []
    };

    if (user.id && user.id !== "" && user.id !== "0") {
      const { error } = await supabase.from('users').update(dbUser).eq('id', user.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from('users').insert(dbUser);
      if (error) throw new Error(error.message);
    }
  } catch (err: any) {
    console.error("Critical error in saveUser:", err);
    throw err;
  }
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
  try {
    const dbLocation = {
      name: location.name,
      address: location.address,
      city: location.city,
      lat: Number(location.lat) || 0,
      lng: Number(location.lng) || 0,
      radius_meters: Number(location.radiusMeters) || 100
    };
    
    if (location.id && location.id !== "" && location.id !== "0") {
      const { error } = await supabase.from('locations').update(dbLocation).eq('id', location.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from('locations').insert(dbLocation);
      if (error) throw new Error(error.message);
    }
  } catch (err: any) {
    console.error("Critical error in saveLocation:", err);
    throw err;
  }
};

export const deleteLocation = async (locId: string) => {
  const { error } = await supabase.from('locations').delete().eq('id', locId);
  if (error) throw new Error(error.message);
}

export const fetchLogs = async (): Promise<LogEntry[]> => {
  const { data, error } = await supabase.from('logs').select('*').order('timestamp', { ascending: false }).limit(200);
  if (error) return [];
  return data.map(mapLogFromDB);
};

export const fetchLogsByDateRange = async (startDate: Date, endDate: Date): Promise<LogEntry[]> => {
    const { data, error } = await supabase
        .from('logs')
        .select('*')
        .gte('timestamp', startDate.toISOString())
        .lte('timestamp', endDate.toISOString())
        .order('timestamp', { ascending: false });
    if (error) return [];
    return data.map(mapLogFromDB);
};

export const fetchLastLog = async (userId: string): Promise<LogEntry | null> => {
    const { data, error } = await supabase
        .from('logs')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(1);
    if (error || !data || data.length === 0) return null;
    return mapLogFromDB(data[0]);
};

export const updateLog = async (logId: string, updates: any) => {
  // Primero obtenemos el log actual para no sobreescribir el feedback AI
  const { data: currentLog, error: fetchError } = await supabase
    .from('logs')
    .select('ai_feedback')
    .eq('id', logId)
    .single();
    
  if (fetchError) throw new Error(fetchError.message);

  const dbUpdates: any = {};
  if (updates.timestamp) dbUpdates.timestamp = updates.timestamp;

  // Si hay cambios en los horarios teóricos, los codificamos en ai_feedback
  if (updates.scheduledStartOverride !== undefined || updates.scheduledEndOverride !== undefined) {
    const currentDecoded = decodeOverrides(currentLog.ai_feedback);
    const newStart = updates.scheduledStartOverride !== undefined ? updates.scheduledStartOverride : currentDecoded.start;
    const newEnd = updates.scheduledEndOverride !== undefined ? updates.scheduledEndOverride : currentDecoded.end;
    
    dbUpdates.ai_feedback = encodeOverrides(currentDecoded.feedback, newStart, newEnd);
  } else if (updates.aiFeedback) {
     // Si solo se actualiza el feedback
     const currentDecoded = decodeOverrides(currentLog.ai_feedback);
     dbUpdates.ai_feedback = encodeOverrides(updates.aiFeedback, currentDecoded.start, currentDecoded.end);
  }
  
  const { error } = await supabase.from('logs').update(dbUpdates).eq('id', logId);
  if (error) throw new Error(error.message);
};

export const deleteLog = async (logId: string) => {
  const { error } = await supabase.from('logs').delete().eq('id', logId);
  if (error) throw new Error(error.message);
};

export const fetchTodayLogs = async (): Promise<LogEntry[]> => {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
    return fetchLogsByDateRange(startOfDay, endOfDay);
};

export const addLog = async (entry: LogEntry) => {
  let photoUrl = entry.photoEvidence;
  if (entry.photoEvidence && entry.photoEvidence.startsWith('data:image')) {
    const dateObj = new Date();
    const folderPath = `evidence/${dateObj.getFullYear()}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`;
    const fileName = `${entry.userName.replace(/\s+/g, '_')}_${entry.type}_${Date.now()}.jpg`;
    const uploadedUrl = await uploadBase64Image(entry.photoEvidence, folderPath, fileName);
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

// --- INCIDENCES ---

export const fetchIncidents = async (userId?: string): Promise<Incident[]> => {
  let query = supabase.from('incidents').select('*').order('date', { ascending: false });
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query;
  if (error) return [];
  return data.map(i => ({
    id: String(i.id),
    userId: i.user_id,
    date: i.date,
    type: i.type,
    amount: i.amount,
    description: i.description
  }));
};

export const saveIncident = async (incident: Partial<Incident>) => {
  const dbData = {
    user_id: incident.userId,
    date: incident.date,
    type: incident.type,
    amount: incident.amount,
    description: incident.description
  };
  if (incident.id && incident.id !== "" && incident.id !== "0") {
    const { error } = await supabase.from('incidents').update(dbData).eq('id', incident.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('incidents').insert(dbData);
    if (error) throw new Error(error.message);
  }
};

export const deleteIncident = async (id: string) => {
  const { error } = await supabase.from('incidents').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

// --- AUTH & CONFIG ---

export const fetchCompanyLogo = async (): Promise<string | null> => {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'company_logo').single();
  return data ? data.value : null;
};

export const saveCompanyLogo = async (base64Image: string): Promise<string | null> => {
   const fileName = `company_logo_${Date.now()}.jpg`;
   const uploadedUrl = await uploadBase64Image(base64Image, 'config', fileName);
   if (!uploadedUrl) return null;
   const { error } = await supabase.from('app_settings').upsert({ key: 'company_logo', value: uploadedUrl });
   if (error) throw new Error(error.message);
   return uploadedUrl;
};

export const authenticateUser = async (dni: string, password: string): Promise<User | null> => {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .or(`dni.eq.${dni},legajo.eq.${dni}`)
        .eq('password', password)
        .single();
    if (error || !data) return null;
    return mapUserFromDB(data);
}
