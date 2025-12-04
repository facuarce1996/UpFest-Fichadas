import React, { useState, useEffect, useRef } from 'react';
import { 
  Role, Location, User, LogEntry, WorkSchedule 
} from './types';
import { 
  getCurrentPosition, calculateDistance, isWithinSchedule, getScheduleDelayInfo,
  fetchUsers, fetchLocations, fetchLogs, addLog, saveUser, deleteUser,
  authenticateUser, saveLocation, deleteLocation, fetchCompanyLogo, saveCompanyLogo
} from './services/utils';
import { analyzeCheckIn } from './services/geminiService';
import { 
  Camera, User as UserIcon, Shield, Clock, 
  LogOut, CheckCircle, XCircle, AlertTriangle, Plus, Save, Lock, Hash, Upload, Trash2, Ban, Image as ImageIcon, Pencil, X, RotateCcw, Home, FileText, Users, Building, MapPin, Map, Eye, Menu, Settings
} from 'lucide-react';

// --- Sub-Components ---

const Header = ({ 
  activeTab, 
  setActiveTab, 
  currentUser, 
  onLogout,
  logoUrl
}: { 
  activeTab: string, 
  setActiveTab: (t: string) => void,
  currentUser: User | null,
  onLogout: () => void,
  logoUrl: string | null
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center gap-4 sm:gap-8">
              <div className="flex-shrink-0 flex items-center gap-2">
                  {logoUrl ? (
                      <img src={logoUrl} alt="Logo" className="h-10 w-auto object-contain" />
                  ) : (
                      <div className="w-8 h-8 bg-slate-900 text-white rounded-full flex items-center justify-center font-bold">UP</div>
                  )}
                  <span className="font-bold text-xl text-slate-800 hidden sm:block">UpFest</span>
              </div>
            
              {currentUser && (
                  <nav className="hidden sm:flex space-x-2">
                      {/* Desktop Navigation */}
                      <button
                          onClick={() => setActiveTab('clock')}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                              activeTab === 'clock' || activeTab === 'self-clock'
                              ? 'bg-orange-50 text-orange-700' 
                              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                          }`}
                      >
                          <span className="flex items-center gap-2"><Clock size={16}/> Fichadas</span>
                      </button>

                      {currentUser.role === Role.ADMIN && (
                          <>
                              <button
                                  onClick={() => setActiveTab('admin')}
                                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                      activeTab === 'admin' 
                                      ? 'bg-orange-600 text-white shadow-md shadow-orange-200' 
                                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                  }`}
                              >
                                  <span className="flex items-center gap-2"><Users size={16}/> Usuarios</span>
                              </button>

                              <button
                                  onClick={() => setActiveTab('locations')}
                                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                      activeTab === 'locations' 
                                      ? 'bg-orange-600 text-white shadow-md shadow-orange-200' 
                                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                  }`}
                              >
                                  <span className="flex items-center gap-2"><Building size={16}/> Salones</span>
                              </button>

                              <button
                                  onClick={() => setActiveTab('config')}
                                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                      activeTab === 'config' 
                                      ? 'bg-orange-600 text-white shadow-md shadow-orange-200' 
                                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                  }`}
                              >
                                  <span className="flex items-center gap-2"><Settings size={16}/> Config</span>
                              </button>
                          </>
                      )}
                  </nav>
              )}
          </div>
        
          {currentUser && (
              <div className="flex items-center gap-4">
                  <div className="hidden sm:flex flex-col items-end">
                      <span className="text-sm font-bold text-gray-800">{currentUser.name}</span>
                      <span className="text-xs text-gray-500">{currentUser.role}</span>
                  </div>
                  
                  <button 
                    onClick={onLogout} 
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-all"
                    title="Cerrar Sesión"
                  >
                      <LogOut size={20} />
                      <span className="hidden lg:inline text-sm font-medium">Salir</span>
                  </button>
                  
                  {/* Mobile Menu Button */}
                  <button 
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    className="sm:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-md focus:outline-none"
                  >
                    {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                  </button>
              </div>
          )}
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {currentUser && isMobileMenuOpen && (
        <div className="sm:hidden bg-white border-t border-gray-100 shadow-lg px-4 pt-2 pb-4 space-y-2 absolute w-full left-0 z-40">
            <div className="px-3 py-2 border-b border-gray-100 mb-2">
                <span className="block text-sm font-bold text-gray-800">{currentUser.name}</span>
                <span className="block text-xs text-gray-500">{currentUser.role}</span>
            </div>

            <button
                onClick={() => { setActiveTab('clock'); setIsMobileMenuOpen(false); }}
                className={`w-full text-left px-3 py-3 rounded-lg text-base font-medium flex items-center gap-3 transition-colors ${
                    activeTab === 'clock' || activeTab === 'self-clock'
                    ? 'bg-orange-50 text-orange-700' 
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
            >
                <Clock size={20}/> Fichadas
            </button>

            {currentUser.role === Role.ADMIN && (
                <>
                    <button
                        onClick={() => { setActiveTab('admin'); setIsMobileMenuOpen(false); }}
                        className={`w-full text-left px-3 py-3 rounded-lg text-base font-medium flex items-center gap-3 transition-colors ${
                            activeTab === 'admin' 
                            ? 'bg-orange-50 text-orange-700' 
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                    >
                        <Users size={20}/> Usuarios
                    </button>

                    <button
                        onClick={() => { setActiveTab('locations'); setIsMobileMenuOpen(false); }}
                        className={`w-full text-left px-3 py-3 rounded-lg text-base font-medium flex items-center gap-3 transition-colors ${
                            activeTab === 'locations' 
                            ? 'bg-orange-50 text-orange-700' 
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                    >
                        <Building size={20}/> Salones
                    </button>
                    
                    <button
                        onClick={() => { setActiveTab('config'); setIsMobileMenuOpen(false); }}
                        className={`w-full text-left px-3 py-3 rounded-lg text-base font-medium flex items-center gap-3 transition-colors ${
                            activeTab === 'config' 
                            ? 'bg-orange-50 text-orange-700' 
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                    >
                        <Settings size={20}/> Configuración
                    </button>
                </>
            )}

            <div className="border-t border-gray-100 pt-2 mt-2">
                <button
                    onClick={() => { onLogout(); setIsMobileMenuOpen(false); }}
                    className="w-full text-left px-3 py-3 rounded-lg text-base font-medium flex items-center gap-3 text-red-600 hover:bg-red-50 transition-colors"
                >
                    <LogOut size={20}/> Cerrar Sesión
                </button>
            </div>
        </div>
      )}
    </header>
  );
};

const LoginView = ({ onLogin, logoUrl }: { onLogin: (u: User) => void, logoUrl: string | null }) => {
  const [dni, setDni] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
        const user = await authenticateUser(dni, password);
        if (user) {
          onLogin(user);
        } else {
          setError('Credenciales incorrectas');
        }
    } catch (e) {
        setError('Error de conexión');
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 space-y-8 border border-slate-100">
        <div className="text-center">
          {logoUrl ? (
               <img src={logoUrl} alt="Logo Empresa" className="h-20 w-auto mx-auto mb-4 object-contain" />
          ) : (
               <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-4 text-white font-bold text-2xl shadow-xl">
                 UP
               </div>
          )}
          <h2 className="text-2xl font-bold text-slate-900">Bienvenido</h2>
          <p className="text-slate-500">Sistema de Gestión de Personal</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Usuario / DNI</label>
            <input
              type="text"
              value={dni}
              onChange={e => setDni(e.target.value)}
              className="w-full px-4 py-3 bg-white text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition"
              placeholder="Ingrese su usuario"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-white text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition"
              placeholder="••••••••"
              required
            />
          </div>

          {error && <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded border border-red-100">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className={`w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-lg transition shadow-lg shadow-orange-200 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {loading ? 'Verificando...' : 'Iniciar Sesión'}
          </button>
        </form>

        <div className="bg-orange-50 rounded-lg p-4 border border-orange-100 text-sm text-slate-700">
            <h4 className="font-bold text-orange-800 mb-2">Credenciales de Prueba:</h4>
            <div className="flex justify-between items-center mb-1">
                <span>Admin:</span>
                <span className="font-mono bg-white px-2 py-0.5 rounded border border-orange-200 text-slate-900">admin / admin</span>
            </div>
            <div className="flex justify-between items-center">
                <span>Usuario:</span>
                <span className="font-mono bg-white px-2 py-0.5 rounded border border-orange-200 text-slate-900">auditor / 123</span>
            </div>
        </div>
      </div>
    </div>
  );
};

const CameraView = ({ onCapture, onCancel }: { onCapture: (img: string) => void, onCancel: () => void }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Camera error", err);
        alert("No se pudo acceder a la cámara.");
        onCancel();
      }
    };
    startCamera();
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [onCancel]);

  const capture = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.8);
        onCapture(dataUrl);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-95 z-[100] flex flex-col items-center justify-center p-4">
      <div className="relative w-full max-w-md bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-700">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-96 object-cover" />
        <canvas ref={canvasRef} className="hidden" />
        <div className="absolute bottom-0 inset-x-0 p-6 flex justify-around bg-gradient-to-t from-black/90 to-transparent">
          <button onClick={onCancel} className="p-4 bg-slate-700 rounded-full text-white hover:bg-slate-600 transition">
            <XCircle size={24} />
          </button>
          <button onClick={capture} className="p-4 bg-white text-orange-600 rounded-full hover:bg-slate-100 ring-4 ring-orange-500/50 transition transform active:scale-95">
            <Camera size={32} />
          </button>
        </div>
      </div>
      <p className="text-white mt-4 text-sm opacity-80">Asegúrate que tu rostro y vestimenta sean visibles.</p>
    </div>
  );
};

// --- User Form Component (Updated to match design) ---

interface UserFormProps { 
  initialData?: Partial<User>; 
  onSubmit: (u: Partial<User>) => void; 
  onCancel?: () => void;
  submitLabel?: string;
}

const UserForm: React.FC<UserFormProps> = ({ 
  initialData, 
  onSubmit, 
  onCancel,
  submitLabel = "Crear Usuario"
}) => {
  const [formData, setFormData] = useState<Partial<User>>({
    name: '', dni: '', password: '', role: Role.WAITER, dressCode: '', legajo: '', schedule: [],
    referenceImage: null, assignedLocations: [],
    ...initialData
  });
  const [scheduleItem, setScheduleItem] = useState<WorkSchedule>({ day: 'Viernes', start: '20:00', end: '04:00' });
  const [imagePreview, setImagePreview] = useState<string | null>(initialData?.referenceImage || null);
  const [locations, setLocations] = useState<Location[]>([]);
  
  const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  useEffect(() => {
    fetchLocations().then(setLocations);
    if(initialData) {
      setFormData(prev => ({ ...prev, ...initialData }));
      setImagePreview(initialData.referenceImage || null);
    }
  }, [initialData]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setImagePreview(result);
        setFormData(prev => ({ ...prev, referenceImage: result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const addSchedule = () => {
    setFormData(prev => ({
      ...prev,
      schedule: [...(prev.schedule || []), scheduleItem]
    }));
  };

  const removeSchedule = (idx: number) => {
    setFormData(prev => ({
      ...prev,
      schedule: prev.schedule?.filter((_, i) => i !== idx)
    }));
  };

  const toggleLocation = (locId: string) => {
    const current = formData.assignedLocations || [];
    if (current.includes(locId)) {
      setFormData(prev => ({ ...prev, assignedLocations: current.filter(id => id !== locId) }));
    } else {
      setFormData(prev => ({ ...prev, assignedLocations: [...current, locId] }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.dni) return;
    if (!formData.legajo) formData.legajo = formData.dni;
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-bold text-slate-700 mb-1 block">DNI</label>
          <input 
            type="text" 
            value={formData.dni || ''} 
            onChange={e => setFormData({...formData, dni: e.target.value})} 
            className="w-full bg-white text-slate-900 border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none" 
            placeholder="12345678" 
            required 
          />
        </div>
        <div>
          <label className="text-sm font-bold text-slate-700 mb-1 block">Contraseña</label>
          <input 
            type="password" 
            value={formData.password || ''} 
            onChange={e => setFormData({...formData, password: e.target.value})} 
            className="w-full bg-white text-slate-900 border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none" 
            placeholder="****" 
            required 
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-bold text-slate-700 mb-1 block">Nombre Completo</label>
        <input 
            type="text" 
            value={formData.name || ''} 
            onChange={e => setFormData({...formData, name: e.target.value})} 
            className="w-full bg-white text-slate-900 border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none" 
            placeholder="Nombre Apellido" 
            required 
        />
      </div>

      <div>
        <label className="text-sm font-bold text-slate-700 mb-1 block">Rol</label>
        <select value={formData.role || Role.WAITER} onChange={e => setFormData({...formData, role: e.target.value as Role})} className="w-full bg-white text-slate-900 border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none">
        {Object.values(Role).map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div>
         <label className="text-sm font-bold text-slate-700 mb-1 block">Código de Vestimenta</label>
         <textarea
            value={formData.dressCode || ''}
            onChange={e => setFormData({...formData, dressCode: e.target.value})}
            className="w-full bg-white text-slate-900 border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none"
            placeholder="Ej: Camisa blanca y pantalón de vestir negro."
            rows={2}
         />
         <p className="text-xs text-slate-400 mt-1">Este texto será usado por la IA para validar la foto.</p>
      </div>

      <div>
         <label className="text-sm font-bold text-slate-700 mb-1 block">Foto de Referencia (Biometría)</label>
         <div className="flex items-center gap-3">
           <label className="cursor-pointer bg-orange-50 hover:bg-orange-100 text-orange-700 font-semibold px-4 py-2 rounded-lg text-sm flex items-center gap-2 border border-orange-200 transition">
             Seleccionar archivo
             <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
           </label>
           <span className="text-sm text-slate-400 italic">
               {imagePreview ? "Imagen cargada" : "Sin archivo seleccionado"}
           </span>
         </div>
         {imagePreview && <img src={imagePreview} className="mt-2 w-20 h-20 rounded-lg object-cover border border-slate-200" alt="Preview" />}
      </div>

      <div>
        <label className="text-sm font-bold text-slate-700 mb-2 block">Sucursales Asignadas</label>
        <div className="space-y-2 border border-slate-200 rounded-lg p-3 bg-slate-50 max-h-32 overflow-y-auto">
           {locations.map(loc => (
             <label key={loc.id} className="flex items-center gap-2 cursor-pointer hover:bg-white p-1 rounded transition">
               <input 
                 type="checkbox" 
                 checked={formData.assignedLocations?.includes(loc.id) || false} 
                 onChange={() => toggleLocation(loc.id)}
                 className="rounded text-orange-600 focus:ring-orange-500"
               />
               <span className="text-sm text-slate-700">{loc.name}</span>
             </label>
           ))}
           {locations.length === 0 && <span className="text-xs text-slate-400">No hay sucursales configuradas.</span>}
        </div>
      </div>
      
      {/* Hidden Fields for now */}
      <div className="hidden">
         <input type="text" value={formData.legajo || ''} onChange={e => setFormData({...formData, legajo: e.target.value})} />
      </div>

      <div className="border-t border-slate-100 pt-4">
        <label className="text-sm font-bold text-slate-700 block mb-2">Cronograma de Trabajo</label>
        <div className="flex flex-wrap gap-2 items-center mb-3">
          <select 
            className="bg-white text-slate-900 border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500" 
            value={scheduleItem.day} 
            onChange={e => setScheduleItem({...scheduleItem, day: e.target.value})}
          >
            {days.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <input 
            type="time" 
            className="bg-white text-slate-900 border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500" 
            value={scheduleItem.start} 
            onChange={e => setScheduleItem({...scheduleItem, start: e.target.value})} 
          />
          <input 
            type="time" 
            className="bg-white text-slate-900 border border-slate-300 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500" 
            value={scheduleItem.end} 
            onChange={e => setScheduleItem({...scheduleItem, end: e.target.value})} 
          />
        </div>
        <button type="button" onClick={addSchedule} className="w-full bg-orange-50 text-orange-700 font-bold py-2 rounded border border-orange-100 hover:bg-orange-100 transition text-sm">
            + Agregar Turno
        </button>

        <div className="space-y-2 mt-3">
          {formData.schedule?.length === 0 && <p className="text-xs text-center text-slate-400 italic">Sin horarios configurados</p>}
          {formData.schedule?.map((s, idx) => (
            <div key={idx} className="flex justify-between items-center text-sm bg-white border px-3 py-2 rounded">
              <span className="font-medium text-slate-600">{s.day}: {s.start} - {s.end}</span>
              <button type="button" onClick={() => removeSchedule(idx)} className="text-red-400 hover:text-red-600"><XCircle size={16}/></button>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-4">
        <button type="submit" className="w-full bg-slate-900 text-white py-3 rounded-lg hover:bg-slate-800 font-bold text-lg shadow-md transition">
            {submitLabel}
        </button>
      </div>
    </form>
  );
};

// --- Location Form Component ---

interface LocationFormProps {
  initialData?: Partial<Location>;
  onSubmit: (l: Location) => void;
  submitLabel?: string;
}

const LocationForm: React.FC<LocationFormProps> = ({ initialData, onSubmit, submitLabel = "Guardar Salón" }) => {
  const [formData, setFormData] = useState<Partial<Location>>({
    name: '', address: '', city: '', lat: -34.6037, lng: -58.3816, radiusMeters: 100,
    ...initialData
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.address) return;
    
    onSubmit({
        id: formData.id || '', // Empty means new
        name: formData.name,
        address: formData.address,
        city: formData.city || '',
        lat: Number(formData.lat),
        lng: Number(formData.lng),
        radiusMeters: Number(formData.radiusMeters)
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="text-sm font-bold text-slate-700 mb-1 block">Nombre del Salón</label>
        <input 
            type="text" 
            value={formData.name || ''} 
            onChange={e => setFormData({...formData, name: e.target.value})} 
            className="w-full bg-white text-slate-900 border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none" 
            placeholder="Ej: Salón Versalles" 
            required 
        />
      </div>

      <div>
        <label className="text-sm font-bold text-slate-700 mb-1 block">Dirección</label>
        <input 
            type="text" 
            value={formData.address || ''} 
            onChange={e => setFormData({...formData, address: e.target.value})} 
            className="w-full bg-white text-slate-900 border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none" 
            placeholder="Ej: Av. Libertador 1234" 
            required 
        />
      </div>

      <div>
        <label className="text-sm font-bold text-slate-700 mb-1 block">Localidad</label>
        <input 
            type="text" 
            value={formData.city || ''} 
            onChange={e => setFormData({...formData, city: e.target.value})} 
            className="w-full bg-white text-slate-900 border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none" 
            placeholder="Ej: CABA" 
            required 
        />
      </div>

      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Configuración GPS (Avanzado)</h4>
          <div className="grid grid-cols-2 gap-4">
              <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">Latitud</label>
                  <input 
                      type="number" step="any"
                      value={formData.lat} 
                      onChange={e => setFormData({...formData, lat: parseFloat(e.target.value)})} 
                      className="w-full bg-white text-slate-900 border border-slate-300 rounded px-2 py-1 text-xs outline-none" 
                  />
              </div>
              <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">Longitud</label>
                  <input 
                      type="number" step="any"
                      value={formData.lng} 
                      onChange={e => setFormData({...formData, lng: parseFloat(e.target.value)})} 
                      className="w-full bg-white text-slate-900 border border-slate-300 rounded px-2 py-1 text-xs outline-none" 
                  />
              </div>
          </div>
          <div className="mt-3">
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Radio Permitido (metros)</label>
              <input 
                  type="number" 
                  value={formData.radiusMeters} 
                  onChange={e => setFormData({...formData, radiusMeters: parseInt(e.target.value)})} 
                  className="w-full bg-white text-slate-900 border border-slate-300 rounded px-2 py-1 text-xs outline-none" 
              />
          </div>
      </div>

      <div className="pt-2">
        <button type="submit" className="w-full bg-slate-900 text-white py-3 rounded-lg hover:bg-slate-800 font-bold text-lg shadow-md transition">
            {submitLabel}
        </button>
      </div>
    </form>
  )
}

// --- Config Dashboard ---

const ConfigDashboard = ({ onLogoUpdate }: { onLogoUpdate: () => void }) => {
    const [logo, setLogo] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchCompanyLogo().then(setLogo);
    }, []);

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = async () => {
                setLoading(true);
                const result = reader.result as string;
                setLogo(result); // Preview inmediato
                await saveCompanyLogo(result);
                setLoading(false);
                onLogoUpdate(); // Notificar a App para recargar header
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-6">
            <h1 className="text-2xl font-bold text-slate-800 mb-6">Configuración del Sistema</h1>
            
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <ImageIcon size={20} /> Imagen Corporativa
                </h2>
                <div className="flex flex-col sm:flex-row items-center gap-8">
                    <div className="flex-shrink-0">
                        <div className="w-32 h-32 bg-slate-100 rounded-full flex items-center justify-center overflow-hidden border-2 border-slate-200">
                            {logo ? (
                                <img src={logo} alt="Logo Empresa" className="w-full h-full object-contain p-2" />
                            ) : (
                                <span className="text-slate-400 font-bold text-2xl">LOGO</span>
                            )}
                        </div>
                    </div>
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Cargar Logo de la Empresa
                        </label>
                        <p className="text-sm text-slate-500 mb-4">
                            Este logo se mostrará en la pantalla de inicio de sesión y en la barra superior.
                            Se recomienda una imagen en formato PNG con fondo transparente.
                        </p>
                        <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition cursor-pointer ${loading ? 'bg-slate-100 text-slate-400' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
                            {loading ? <div className="animate-spin w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full"></div> : <Upload size={18} />}
                            {loading ? 'Subiendo...' : 'Seleccionar Archivo'}
                            <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={loading} />
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Main Components ---

const ClockInModule = ({ user, onFinished }: { user: User, onFinished: () => void }) => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [step, setStep] = useState<'DASHBOARD' | 'OFF_SCHEDULE_WARNING' | 'VALIDATING_LOC' | 'CAMERA' | 'PROCESSING' | 'RESULT'>('DASHBOARD');
  const [statusMsg, setStatusMsg] = useState('');
  const [result, setResult] = useState<LogEntry | null>(null);
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [pendingAction, setPendingAction] = useState<'CHECK_IN' | 'CHECK_OUT' | null>(null);

  useEffect(() => {
    fetchLocations().then(setLocations);
    // Fetch logs to check last status
    fetchLogs().then(logs => {
        const userLogs = logs.filter(l => l.userId === user.id && l.type !== 'BLOCKED');
        if (userLogs.length > 0) {
            setIsClockedIn(userLogs[0].type === 'CHECK_IN');
        }
    });
  }, [user.id, result]);

  const initiateClockInSequence = (type: 'CHECK_IN' | 'CHECK_OUT') => {
    setPendingAction(type);
    const onSchedule = isWithinSchedule(user.schedule);
    
    if (!onSchedule) {
        setStep('OFF_SCHEDULE_WARNING');
        return;
    }
    proceedToLocationCheck(type);
  }

  const proceedToLocationCheck = async (type: 'CHECK_IN' | 'CHECK_OUT') => {
    setStep('VALIDATING_LOC');
    setStatusMsg('Verificando ubicación...');
    try {
      const pos = await getCurrentPosition();
      let nearestLoc: Location | null = null;
      let minDistance = Infinity;
      locations.forEach(loc => {
        const dist = calculateDistance(pos.coords.latitude, pos.coords.longitude, loc.lat, loc.lng);
        if (dist < minDistance) { minDistance = dist; nearestLoc = loc; }
      });

      if (!nearestLoc) throw new Error("Sin ubicaciones");
      const isInside = minDistance <= (nearestLoc as Location).radiusMeters;
      
      setStep('CAMERA');
      const onSchedule = isWithinSchedule(user.schedule); // Re-check strictly for logging status
      setResult({
        id: crypto.randomUUID(), userId: user.id, userName: user.name, legajo: user.legajo, timestamp: new Date().toISOString(), type,
        locationId: (nearestLoc as Location).id, locationName: (nearestLoc as Location).name, locationStatus: isInside ? 'VALID' : 'INVALID',
        scheduleStatus: onSchedule ? 'ON_TIME' : 'OFF_SCHEDULE', dressCodeStatus: 'FAIL', identityStatus: 'NO_MATCH', photoEvidence: '', aiFeedback: ''
      });
    } catch (err) {
      alert("Error GPS. Asegúrate de permitir el acceso a la ubicación.");
      setStep('DASHBOARD');
    }
  };

  const handleCapture = async (imgBase64: string) => {
    if (!result) return;
    setStep('PROCESSING');
    setStatusMsg('Analizando biométria...');
    try {
      const aiResponse = await analyzeCheckIn(imgBase64, user.dressCode, user.referenceImage);
      const finalEntry: LogEntry = {
        ...result, photoEvidence: imgBase64,
        identityStatus: user.referenceImage ? (aiResponse.identityMatch ? 'MATCH' : 'NO_MATCH') : 'NO_REF',
        dressCodeStatus: aiResponse.dressCodeMatches ? 'PASS' : 'FAIL', aiFeedback: aiResponse.description
      };
      // We do NOT save automatically here anymore, wait for confirmation
      setResult(finalEntry);
      setStep('RESULT');
    } catch (err) { setStep('DASHBOARD'); }
  };
  
  const handleFinalSave = async () => {
      if (result) {
          await addLog(result);
          onFinished();
      }
  };
  
  const handleRetryPhoto = () => {
      setStep('CAMERA');
  };
  
  const handleSaveWithIncident = async () => {
      if (result) {
          // Force save even with issues
          await addLog(result);
          onFinished();
      }
  };

  const getTodayScheduleDisplay = () => {
      const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      const today = days[new Date().getDay()];
      const sched = user.schedule?.find(s => s.day === today);
      if (sched) return `${sched.start} a ${sched.end}`;
      return "No tienes horario asignado hoy";
  }

  const reset = () => { setStep('DASHBOARD'); setResult(null); setPendingAction(null); };

  if (step === 'CAMERA') return <CameraView onCapture={handleCapture} onCancel={() => setStep('DASHBOARD')} />;

  return (
    <div className="max-w-xl mx-auto p-4">
      {step === 'DASHBOARD' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-900 p-6 text-white text-center">
             <h2 className="text-2xl font-bold">Hola, {user.name}</h2>
             <p className="opacity-80 text-sm">{user.role}</p>
          </div>
          <div className="p-8 space-y-6">
             <div className="flex justify-center">
                 <div className={`px-4 py-1 rounded-full text-sm font-bold tracking-wide uppercase border ${isClockedIn ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                     Estado: {isClockedIn ? 'EN TURNO' : 'NO INICIADO'}
                 </div>
             </div>
             
             <button onClick={() => initiateClockInSequence('CHECK_IN')} disabled={isClockedIn} className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition shadow-md ${isClockedIn ? 'bg-gray-100 text-gray-400' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                 <Clock /> Registrar Ingreso
             </button>
             <button onClick={() => initiateClockInSequence('CHECK_OUT')} disabled={!isClockedIn} className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition shadow-md ${!isClockedIn ? 'bg-gray-100 text-gray-400' : 'bg-orange-600 text-white hover:bg-orange-700'}`}>
                 <LogOut /> Registrar Egreso
             </button>
          </div>
        </div>
      )}

      {step === 'OFF_SCHEDULE_WARNING' && (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center border-t-4 border-orange-500">
             <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4 text-orange-600">
                <AlertTriangle size={32} />
             </div>
             <h2 className="text-xl font-bold text-slate-900 mb-2">Fuera de Horario</h2>
             <p className="text-slate-600 mb-6">
                Tu horario laboral registrado para hoy es de <span className="font-bold text-slate-900">{getTodayScheduleDisplay()}</span> hs.
             </p>
             <div className="space-y-3">
                 <button 
                    onClick={() => pendingAction && proceedToLocationCheck(pendingAction)}
                    className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold hover:bg-slate-800 transition"
                 >
                    Fichar igualmente
                 </button>
                 <button 
                    onClick={reset}
                    className="w-full bg-white text-slate-600 border border-slate-200 py-3 rounded-lg font-bold hover:bg-slate-50 transition"
                 >
                    No registrar fichada
                 </button>
             </div>
          </div>
      )}

      {(step === 'VALIDATING_LOC' || step === 'PROCESSING') && (
        <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <div className="animate-spin w-10 h-10 border-4 border-orange-600 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-slate-600 font-medium">{statusMsg}</p>
        </div>
      )}

      {step === 'RESULT' && result && (
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
              <div className="bg-slate-900 p-4 text-white text-center font-bold text-lg">
                  {result.type === 'CHECK_IN' ? 'Entrada Registrada' : 'Salida Registrada'}
              </div>
              <div className="p-6 text-center space-y-4">
                  <img src={result.photoEvidence} className="w-24 h-24 rounded-full mx-auto object-cover border-4 border-slate-100" alt="evidencia" />
                  <div className="space-y-2 text-left bg-slate-50 p-4 rounded-lg">
                       <div className="flex justify-between border-b pb-2">
                           <span className="text-slate-500 text-sm">Horario</span>
                           <div className="text-right">
                               <span className="font-mono font-bold text-slate-800 block">{new Date(result.timestamp).toLocaleTimeString()}</span>
                               {getScheduleDelayInfo(user.schedule) && (
                                   <span className="text-xs text-orange-600 font-medium block">{getScheduleDelayInfo(user.schedule)}</span>
                               )}
                           </div>
                       </div>
                       <div className="flex justify-between border-b pb-2">
                           <span className="text-slate-500 text-sm">Estado Horario</span>
                           <span className={`font-bold text-sm ${result.scheduleStatus === 'ON_TIME' ? 'text-green-600' : 'text-orange-600'}`}>
                               {result.scheduleStatus === 'ON_TIME' ? 'En Horario' : 'Fuera de Horario'}
                           </span>
                       </div>
                       <div className="flex justify-between border-b pb-2">
                           <span className="text-slate-500 text-sm">Ubicación</span>
                           <div className="text-right">
                               <span className={`font-bold text-sm block ${result.locationStatus === 'VALID' ? 'text-green-600' : 'text-red-500'}`}>
                                   {result.locationStatus === 'VALID' ? 'Correcta' : 'Incorrecta'}
                               </span>
                               <span className="text-xs text-slate-400 block">{result.locationName}</span>
                           </div>
                       </div>
                       <div className="flex justify-between">
                           <span className="text-slate-500 text-sm">Biometría</span>
                           <span className={`font-bold text-sm ${result.identityStatus === 'MATCH' ? 'text-green-600' : 'text-red-500'}`}>{result.identityStatus === 'MATCH' ? 'Aprobada' : 'Revisar'}</span>
                       </div>
                  </div>
                  
                  {/* Actions based on result */}
                  {result.identityStatus === 'MATCH' ? (
                      <button onClick={handleFinalSave} className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold">
                          Finalizar
                      </button>
                  ) : (
                      <div className="space-y-3">
                          <button onClick={handleRetryPhoto} className="w-full bg-orange-600 text-white py-3 rounded-lg font-bold hover:bg-orange-700">
                              Reintentar Foto
                          </button>
                          <button onClick={handleSaveWithIncident} className="w-full bg-transparent text-slate-500 py-3 rounded-lg font-medium hover:bg-slate-50 text-sm">
                              Fichar con Incidencia
                          </button>
                      </div>
                  )}
              </div>
          </div>
      )}
    </div>
  );
}

// --- Logs Dashboard (Admin View for Fichadas) ---

const LogsDashboard = () => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);

    useEffect(() => {
        fetchLogs().then(setLogs);
        const interval = setInterval(() => fetchLogs().then(setLogs), 3000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="max-w-7xl mx-auto p-6">
            <h1 className="text-2xl font-bold text-slate-800 mb-6">Historial de Fichadas</h1>
            
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-white border-b border-slate-100">
                                <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider">Hora / Día</th>
                                <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider">Empleado</th>
                                <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider">Salón</th>
                                <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider">Tipo</th>
                                <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Evidencia</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {logs.map(log => (
                                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="py-4 px-6">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-slate-900">{new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                            <span className="text-xs text-slate-500">{new Date(log.timestamp).toLocaleDateString()}</span>
                                        </div>
                                    </td>
                                    <td className="py-4 px-6">
                                        <div className="font-medium text-slate-900">{log.userName}</div>
                                        <div className="text-xs text-slate-500">{log.legajo}</div>
                                    </td>
                                    <td className="py-4 px-6">
                                        <div className="text-sm text-slate-600">{log.locationName}</div>
                                        {log.locationStatus !== 'VALID' && (
                                            <span className="text-xs text-red-500 font-bold">Ubicación Inválida</span>
                                        )}
                                    </td>
                                    <td className="py-4 px-6">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                            log.type === 'CHECK_IN' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
                                        }`}>
                                            {log.type === 'CHECK_IN' ? 'Entrada' : 'Salida'}
                                        </span>
                                        {log.scheduleStatus === 'OFF_SCHEDULE' && (
                                            <div className="mt-1 text-xs text-orange-600 font-bold flex items-center gap-1">
                                                <AlertTriangle size={10} /> Fuera de Horario
                                            </div>
                                        )}
                                    </td>
                                    <td className="py-4 px-6 text-right">
                                        <button 
                                            onClick={() => setSelectedLog(log)}
                                            className="text-slate-600 hover:text-orange-600 transition flex items-center gap-1 ml-auto text-sm font-medium"
                                        >
                                            <ImageIcon size={16} /> Ver Foto
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {logs.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="py-8 text-center text-slate-400 text-sm">
                                        No hay fichadas registradas.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {selectedLog && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col md:flex-row">
                        <div className="w-full md:w-1/2 bg-black flex items-center justify-center relative">
                            <img src={selectedLog.photoEvidence} className="max-h-[400px] object-contain" alt="Evidencia" />
                            <div className="absolute bottom-4 left-4 right-4 bg-black/60 text-white p-2 rounded text-xs">
                                {new Date(selectedLog.timestamp).toLocaleString()}
                            </div>
                        </div>
                        <div className="w-full md:w-1/2 p-6 flex flex-col">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">{selectedLog.userName}</h3>
                                    <p className="text-slate-500 text-sm">{selectedLog.type === 'CHECK_IN' ? 'Entrada' : 'Salida'} en {selectedLog.locationName}</p>
                                </div>
                                <button onClick={() => setSelectedLog(null)} className="text-slate-400 hover:text-slate-600">
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="space-y-4 flex-1 overflow-y-auto">
                                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Análisis de IA</h4>
                                    <p className="text-sm text-slate-700 italic">"{selectedLog.aiFeedback}"</p>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className={`p-3 rounded-lg border ${selectedLog.identityStatus === 'MATCH' ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                                        <div className="text-xs font-bold uppercase mb-1 flex items-center gap-1">
                                            {selectedLog.identityStatus === 'MATCH' ? <CheckCircle size={12}/> : <XCircle size={12}/>} Identidad
                                        </div>
                                        <span className={`text-sm font-bold ${selectedLog.identityStatus === 'MATCH' ? 'text-green-700' : 'text-red-700'}`}>
                                            {selectedLog.identityStatus === 'MATCH' ? 'Verificado' : 'No Coincide'}
                                        </span>
                                    </div>
                                    <div className={`p-3 rounded-lg border ${selectedLog.dressCodeStatus === 'PASS' ? 'bg-green-50 border-green-100' : 'bg-orange-50 border-orange-100'}`}>
                                        <div className="text-xs font-bold uppercase mb-1 flex items-center gap-1">
                                            {selectedLog.dressCodeStatus === 'PASS' ? <CheckCircle size={12}/> : <AlertTriangle size={12}/>} Vestimenta
                                        </div>
                                        <span className={`text-sm font-bold ${selectedLog.dressCodeStatus === 'PASS' ? 'text-green-700' : 'text-orange-700'}`}>
                                            {selectedLog.dressCodeStatus === 'PASS' ? 'Correcta' : 'Revisar'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="mt-6 pt-4 border-t border-slate-100">
                                <button onClick={() => setSelectedLog(null)} className="w-full bg-slate-900 text-white py-2 rounded-lg font-bold">Cerrar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// --- Admin Locations Dashboard ---

const LocationsDashboard = () => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    fetchLocations().then(setLocations);
    const interval = setInterval(() => fetchLocations().then(setLocations), 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSave = async (loc: Location) => {
    await saveLocation(loc);
    setIsCreating(false);
    setEditingLocation(null);
    setFormKey(k => k + 1);
    fetchLocations().then(setLocations);
  };

  const handleDelete = async (id: string) => {
    if(window.confirm('¿Eliminar este salón?')) {
        await deleteLocation(id);
        fetchLocations().then(setLocations);
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Gestión de Salones</h1>
          <button 
            onClick={() => setIsCreating(true)}
            className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition"
          >
              <Plus size={18} /> Nuevo Salón
          </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-white border-b border-slate-100">
                        <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider">Salón</th>
                        <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider">Dirección</th>
                        <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider">Coordenadas</th>
                        <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Acciones</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                    {locations.map(loc => (
                        <tr key={loc.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-4 px-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-orange-600 flex-shrink-0">
                                        <Building size={20} />
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-900">{loc.name}</div>
                                        <div className="text-xs text-slate-500">{loc.city}</div>
                                    </div>
                                </div>
                            </td>
                            <td className="py-4 px-6">
                                <span className="text-sm text-slate-600">{loc.address}</span>
                            </td>
                            <td className="py-4 px-6">
                                <div className="flex flex-col gap-1">
                                    <span className="text-xs text-slate-400">Lat: {loc.lat.toFixed(4)}</span>
                                    <span className="text-xs text-slate-400">Lng: {loc.lng.toFixed(4)}</span>
                                </div>
                            </td>
                            <td className="py-4 px-6 text-right">
                                <div className="flex justify-end gap-2">
                                    <button onClick={() => setEditingLocation(loc)} className="text-slate-400 hover:text-orange-600 transition">
                                        <Pencil size={18} />
                                    </button>
                                    <button onClick={() => handleDelete(loc.id)} className="text-slate-400 hover:text-red-600 transition">
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                    {locations.length === 0 && (
                        <tr>
                            <td colSpan={4} className="py-8 text-center text-slate-400 text-sm">
                                No hay salones registrados.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
      </div>

      {(isCreating || editingLocation) && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                  <div className="flex justify-between items-center p-6 border-b border-slate-100">
                      <h3 className="text-xl font-bold text-slate-900">
                          {isCreating ? 'Nuevo Salón' : 'Editar Salón'}
                      </h3>
                      <button onClick={() => { setIsCreating(false); setEditingLocation(null); }} className="text-slate-400 hover:text-slate-600">
                          <X size={24}/>
                      </button>
                  </div>
                  <div className="p-6">
                      <LocationForm 
                          key={isCreating ? formKey : editingLocation?.id}
                          initialData={editingLocation || undefined}
                          onSubmit={handleSave}
                      />
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

// --- Admin Module ---

const AdminDashboard = ({ 
  currentUserId,
  onUserUpdate
}: { 
  currentUserId: string,
  onUserUpdate: (u: User) => void
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createFormKey, setCreateFormKey] = useState(0);

  useEffect(() => {
    fetchUsers().then(setUsers);
    fetchLocations().then(setLocations);
    const interval = setInterval(() => fetchUsers().then(setUsers), 3000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateUser = async (data: Partial<User>) => {
    await saveUser({
      id: '', // Empty means new in Supabase logic
      legajo: data.legajo || data.dni || '',
      name: data.name || '',
      dni: data.dni || '', 
      password: data.password || '1234',
      role: data.role || Role.OTHER,
      dressCode: data.dressCode || 'Uniforme estándar',
      referenceImage: data.referenceImage || null,
      schedule: data.schedule || [],
      assignedLocations: data.assignedLocations || []
    });
    setCreateFormKey(k => k + 1);
    setIsCreating(false);
    fetchUsers().then(setUsers);
  };

  const handleUpdateUser = async (data: Partial<User>) => {
    if (!data.id) return;
    await saveUser(data as User);
    if (data.id === currentUserId) onUserUpdate(data as User);
    setEditingUser(null);
    fetchUsers().then(setUsers);
  };

  // Helper to get location names
  const getLocationNames = (ids?: string[]) => {
    if (!ids || ids.length === 0) return 'Ninguna';
    return ids.map(id => locations.find(l => l.id === id)?.name || id).join(', ');
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Gestión de Usuarios</h1>
          <button 
            onClick={() => setIsCreating(true)}
            className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition"
          >
              <Plus size={18} /> Nuevo Usuario
          </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
         <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-white border-b border-slate-100">
                        <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider">Usuario</th>
                        <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider">Rol</th>
                        <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider">Sucursales Asignadas</th>
                        <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Editar</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                    {users.map(u => (
                        <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-4 px-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-slate-200 flex-shrink-0 overflow-hidden">
                                        {u.referenceImage ? (
                                            <img src={u.referenceImage} className="w-full h-full object-cover" alt="avatar" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-400"><UserIcon size={20}/></div>
                                        )}
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-900">{u.name}</div>
                                        <div className="text-xs text-slate-500">@{u.dni}</div>
                                    </div>
                                </div>
                            </td>
                            <td className="py-4 px-6">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 mt-1">
                                    {u.role}
                                </span>
                            </td>
                            <td className="py-4 px-6">
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-100 max-w-[200px] truncate" title={getLocationNames(u.assignedLocations)}>
                                    {getLocationNames(u.assignedLocations)}
                                </span>
                            </td>
                            <td className="py-4 px-6 text-right">
                                <button onClick={() => setEditingUser(u)} className="text-slate-400 hover:text-orange-600 transition">
                                    <Pencil size={18} />
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
         </div>
      </div>

      {/* Modal for Create/Edit */}
      {(isCreating || editingUser) && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                  <div className="flex justify-between items-center p-6 border-b border-slate-100">
                      <h3 className="text-xl font-bold text-slate-900">
                          {isCreating ? 'Nuevo Usuario' : 'Editar Usuario'}
                      </h3>
                      <button onClick={() => { setIsCreating(false); setEditingUser(null); }} className="text-slate-400 hover:text-slate-600">
                          <X size={24}/>
                      </button>
                  </div>
                  <div className="p-6">
                      <UserForm 
                          key={isCreating ? createFormKey : editingUser?.id}
                          initialData={editingUser || undefined}
                          onSubmit={isCreating ? handleCreateUser : handleUpdateUser}
                          submitLabel={isCreating ? "Crear Usuario" : "Guardar Cambios"}
                      />
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

// --- App Container ---

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('clock');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Fetch logo on initial load
  useEffect(() => {
    fetchCompanyLogo().then(setLogoUrl);
  }, []);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header 
            activeTab={activeTab} 
            setActiveTab={setActiveTab} 
            currentUser={null} 
            onLogout={() => {}} 
            logoUrl={logoUrl}
        />
        <LoginView 
            onLogin={(user) => { setCurrentUser(user); setActiveTab(user.role === Role.ADMIN ? 'admin' : 'clock'); }} 
            logoUrl={logoUrl}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        currentUser={currentUser}
        onLogout={() => setCurrentUser(null)}
        logoUrl={logoUrl}
      />
      
      <main className="flex-1">
        {activeTab === 'clock' && currentUser.role !== Role.ADMIN && (
          <ClockInModule user={currentUser} onFinished={() => setCurrentUser(null)} />
        )}
        {activeTab === 'clock' && currentUser.role === Role.ADMIN && (
             <div className="flex flex-col gap-6">
                 {/* Admin can see the dashboard BUT also has a button to check in themselves */}
                 <div className="max-w-7xl mx-auto w-full px-6 pt-6">
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex justify-between items-center">
                        <div>
                             <h3 className="text-orange-900 font-bold">Modo Administrador</h3>
                             <p className="text-orange-700 text-sm">Estás viendo el registro global. ¿Necesitas fichar tu propia entrada?</p>
                        </div>
                        <button onClick={() => setActiveTab('self-clock')} className="bg-orange-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-orange-700 transition">
                            Ir a mi Fichada
                        </button>
                    </div>
                 </div>
                 <LogsDashboard />
             </div>
        )}
        {activeTab === 'self-clock' && (
          <ClockInModule user={currentUser} onFinished={() => setCurrentUser(null)} />
        )}

        {activeTab === 'admin' && currentUser.role === Role.ADMIN && (
          <AdminDashboard currentUserId={currentUser.id} onUserUpdate={setCurrentUser} />
        )}
        {activeTab === 'locations' && currentUser.role === Role.ADMIN && (
          <LocationsDashboard />
        )}
        
        {activeTab === 'config' && currentUser.role === Role.ADMIN && (
          <ConfigDashboard onLogoUpdate={() => fetchCompanyLogo().then(setLogoUrl)} />
        )}
      </main>
    </div>
  );
}