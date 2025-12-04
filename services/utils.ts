import { Location, User, LogEntry, Role, WorkSchedule } from "../types";
import { supabase } from "./supabaseClient";

// --- Time & Schedule Helpers (Mantienen lógica local) ---

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
    
    // Buscar el horario de hoy
    const todaySchedule = schedules.find(s => s.day === todayName);
    
    if (!todaySchedule) return null;

    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    
    const [startHours, startMinutes] = todaySchedule.start.split(':').map(Number);
    
    // Convertir todo a minutos para comparar
    const nowTotalMinutes = currentHours * 60 + currentMinutes;
    const startTotalMinutes = startHours * 60 + startMinutes;
    
    // Si llegó tarde (más de 15 mins de tolerancia por ejemplo, o estricto > 0)
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

// --- Geolocation (Mantiene lógica local) ---

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

// --- SUPABASE STORAGE HELPERS ---

// Convierte Base64 a Blob y lo sube al bucket 'fichadas'
// Ahora permite nombres de archivo personalizados para mejor organización
const uploadBase64Image = async (base64Data: string, folder: string, customFileName?: string): Promise<string | null> => {
  try {
    // 1. Limpiar cabecera del base64
    const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, "");
    
    // 2. Convertir a buffer binario
    const byteCharacters = atob(base64Clean);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/jpeg' });

    // 3. Generar nombre único si no se provee uno
    const finalFileName = customFileName 
        ? `${folder}/${customFileName}`
        : `${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;

    // 4. Subir a Supabase Storage (Bucket: 'fichadas')
    const { data, error } = await supabase.storage
      .from('fichadas')
      .upload(finalFileName, blob, {
        contentType: 'image/jpeg',
        upsert: true 
      });

    if (error) {
      console.error('Error uploading image to Supabase:', error);
      // Intentar mostrar detalles del error
      if ((error as any).statusCode === '404') {
          console.error("Bucket 'fichadas' not found. Please create it.");
      }
      return null;
    }

    // 5. Obtener URL Pública
    const { data: publicUrlData } = supabase.storage
      .from('fichadas')
      .getPublicUrl(finalFileName);

    return publicUrlData.publicUrl;

  } catch (error) {
    console.error('Error processing image upload logic:', error);
    return null;
  }
};

// --- SUPABASE DATA OPERATIONS ---

// Helpers para mapear de Snake Case (DB) a Camel Case (App)
const mapUserFromDB = (u: any): User => ({
  id: u.id,
  legajo: u.legajo || '',
  dni: u.dni,
  password: u.password,
  name: u.name,
  role: u.role as Role,
  dressCode: u.dress_code || '',
  referenceImage: u.reference_image || null,
  schedule: u.schedule || [],
  assignedLocations: u.assigned_locations || []
});

const mapLocationFromDB = (l: any): Location => ({
  id: l.id,
  name: l.name,
  address: l.address || '',
  city: l.city || '',
  lat: l.lat,
  lng: l.lng,
  radiusMeters: l.radius_meters
});

const mapLogFromDB = (l: any): LogEntry => ({
  id: l.id,
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
  aiFeedback: l.ai_feedback || ''
});

// USERS
export const fetchUsers = async (): Promise<User[]> => {
  const { data, error } = await supabase.from('users').select('*');
  if (error) {
      // Si la tabla no existe, no crashear, devolver vacío.
      if (error.code === '42P01') {
          console.warn("Table 'users' does not exist yet.");
          return [];
      }
      console.error('Error fetching users:', error);
      return [];
  }
  return data.map(mapUserFromDB);
};

export const saveUser = async (user: User) => {
  let referenceImageUrl = user.referenceImage;

  // Si la imagen es Base64 (nueva subida), la subimos a Storage
  if (user.referenceImage && user.referenceImage.startsWith('data:image')) {
    // Usamos el ID o DNI para el nombre del archivo, para que sea ordenado
    const fileName = `${user.dni}_ref_${Date.now()}.jpg`;
    const uploadedUrl = await uploadBase64Image(user.referenceImage, 'users', fileName);
    if (uploadedUrl) {
      referenceImageUrl = uploadedUrl;
    }
  }

  // Convert to DB format
  const dbUser = {
    id: user.id.length < 10 ? undefined : user.id, 
    dni: user.dni,
    password: user.password,
    name: user.name,
    role: user.role,
    legajo: user.legajo,
    dress_code: user.dressCode,
    reference_image: referenceImageUrl,
    schedule: user.schedule,
    assigned_locations: user.assignedLocations
  };

  if (user.id && user.id.length > 20) {
      const { error } = await supabase.from('users').update(dbUser).eq('id', user.id);
      if (error) console.error('Error updating user:', error);
  } else {
      const { error } = await supabase.from('users').insert(dbUser);
      if (error) console.error('Error inserting user:', error);
  }
};

export const deleteUser = async (userId: string) => {
  const { error } = await supabase.from('users').delete().eq('id', userId);
  if (error) console.error('Error deleting user:', error);
}

// LOCATIONS
export const fetchLocations = async (): Promise<Location[]> => {
  const { data, error } = await supabase.from('locations').select('*');
  if (error) {
    console.error('Error fetching locations:', error);
    return [];
  }
  return data.map(mapLocationFromDB);
};

export const saveLocation = async (location: Location) => {
  const dbLocation = {
    name: location.name,
    address: location.address,
    city: location.city,
    lat: location.lat,
    lng: location.lng,
    radius_meters: location.radiusMeters
  };

  if (location.id && location.id.length > 20) {
      await supabase.from('locations').update(dbLocation).eq('id', location.id);
  } else {
      await supabase.from('locations').insert(dbLocation);
  }
};

export const deleteLocation = async (locId: string) => {
  await supabase.from('locations').delete().eq('id', locId);
}

// LOGS (FICHADAS)
export const fetchLogs = async (): Promise<LogEntry[]> => {
  const { data, error } = await supabase.from('logs').select('*').order('timestamp', { ascending: false }).limit(100);
  if (error) {
    if (error.code === '42P01') return [];
    console.error('Error fetching logs:', error);
    return [];
  }
  return data.map(mapLogFromDB);
};

export const addLog = async (entry: LogEntry) => {
  let photoUrl = entry.photoEvidence;

  // Subir evidencia a Storage si es Base64
  if (entry.photoEvidence && entry.photoEvidence.startsWith('data:image')) {
    // Crear estructura de carpetas: evidence / AÑO / MES / usuario_fecha.jpg
    const dateObj = new Date();
    const year = dateObj.getFullYear();
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const folderPath = `evidence/${year}/${month}`;
    
    // Nombre de archivo descriptivo
    const fileName = `${entry.userName.replace(/\s+/g, '_')}_${entry.type}_${Date.now()}.jpg`;
    
    const uploadedUrl = await uploadBase64Image(entry.photoEvidence, folderPath, fileName);
    
    if (uploadedUrl) {
      console.log("Fichada image uploaded successfully:", uploadedUrl);
      photoUrl = uploadedUrl;
    } else {
      console.warn("Failed to upload fichada image. Saving base64 directly to DB (not recommended for large scale).");
    }
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
    ai_feedback: entry.aiFeedback
  };

  const { error } = await supabase.from('logs').insert(dbLog);
  if (error) console.error('Error saving log:', error);
};

// APP CONFIG (LOGO)

export const fetchCompanyLogo = async (): Promise<string | null> => {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'company_logo')
    .single();
  
  if (error) {
      if (error.code === '42P01') {
          console.error("Tabla 'app_settings' no existe. Ejecuta el SQL de Setup.");
      }
      return null;
  }
  return data ? data.value : null;
};

export const saveCompanyLogo = async (base64Image: string): Promise<string | null> => {
   // Subir a Storage
   // Usamos un nombre fijo o timestamp para el logo
   const fileName = `company_logo_${Date.now()}.jpg`;
   const uploadedUrl = await uploadBase64Image(base64Image, 'config', fileName);
   
   if (!uploadedUrl) return null;

   // Guardar en DB
   const { error } = await supabase
     .from('app_settings')
     .upsert({ key: 'company_logo', value: uploadedUrl });
   
   if (error) {
     console.error('Error updating company logo:', error);
     return null;
   }
   
   return uploadedUrl;
};

// Authentication
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