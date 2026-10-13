import { createClient } from '@supabase/supabase-js';

// Rate limit simple en memoria por IP (máx 10 intentos por minuto)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string, maxAttempts = 10, windowMs = 60 * 1000): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxAttempts) {
    return false;
  }
  entry.count++;
  return true;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Obtener IP para rate limiting
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 
             req.headers['x-real-ip'] || 
             req.socket?.remoteAddress || 
             '127.0.0.1';

  if (!checkRateLimit(ip, 10, 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiados intentos de acceso. Por favor espere 1 minuto.' });
  }

  try {
    const { dni, password } = req.body || {};
    const trimmedDni = typeof dni === 'string' ? dni.trim() : '';

    // Validar formato de DNI (numérico de 7 u 8 dígitos; '00000000' es válido)
    const dniRegex = /^\d{7,8}$/;
    if (!dniRegex.test(trimmedDni)) {
      return res.status(400).json({ error: 'El DNI debe ser numérico de 7 u 8 dígitos' });
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("Variables de entorno de Supabase no configuradas en el servidor.");
      return res.status(500).json({ error: 'Configuración del servidor incompleta.' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('dni', trimmedDni)
      .maybeSingle();

    if (error) {
      console.error("Error al consultar usuario en base de datos:", error.message);
      return res.status(500).json({ error: 'Error en la base de datos' });
    }

    // Si el usuario no existe -> 404
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Si is_active es false -> 403 "CUENTA DESACTIVADA"
    if (user.is_active === false) {
      return res.status(403).json({ error: 'CUENTA DESACTIVADA' });
    }

    // Si role === 'Admin' -> exigir que password coincida exactamente con trim()
    if (user.role === 'Admin') {
      const trimmedPass = typeof password === 'string' ? password.trim() : '';
      if (!trimmedPass) {
        return res.status(401).json({ 
          requirePassword: true, 
          role: 'Admin', 
          error: 'Contraseña requerida' 
        });
      }

      const storedPass = (user.password || '').trim();
      if (trimmedPass !== storedPass) {
        return res.status(401).json({ 
          requirePassword: true, 
          role: 'Admin', 
          error: 'Contraseña incorrecta' 
        });
      }
    }

    // Si no es Admin -> no exigir contraseña (los empleados fichan solo con DNI)
    // Devolver el usuario SIN el campo password
    const safeUser = {
      id: user.id,
      dni: user.dni,
      name: user.name,
      role: user.role,
      legajo: user.legajo,
      dressCode: user.dress_code,
      photoRef: user.reference_image,
      schedule: user.schedule || [],
      assignedLocations: Array.isArray(user.assigned_locations) ? user.assigned_locations : [],
      isActive: user.is_active
    };

    return res.status(200).json({ user: safeUser });

  } catch (err: any) {
    console.error("Error no controlado en endpoint login:", err.message || err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
