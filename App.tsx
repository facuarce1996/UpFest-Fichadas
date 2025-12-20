import React, { useState, useEffect, useRef } from 'react';
import { 
  Role, Location, User, LogEntry, WorkSchedule 
} from './types';
import { 
  getCurrentPosition, calculateDistance, isWithinSchedule, getScheduleDelayInfo,
  fetchUsers, fetchLocations, fetchLogs, fetchTodayLogs, fetchLogsByDateRange, addLog, saveUser, deleteUser,
  authenticateUser, saveLocation, deleteLocation, fetchCompanyLogo, saveCompanyLogo
} from './services/utils';
import { analyzeCheckIn } from './services/geminiService';
import { 
  Camera, User as UserIcon, Shield, Clock, 
  LogOut, CheckCircle, XCircle, AlertTriangle, Plus, Save, Lock, Hash, Upload, Trash2, Ban, Image as ImageIcon, Pencil, X, RotateCcw, Home, FileText, Users, Building, MapPin, Map, Eye, Menu, Settings, ChevronRight, LayoutDashboard, ArrowLeft, Calendar, Download, Search, Filter, FileSpreadsheet, File
} from 'lucide-react';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// --- Sub-Components ---

const Sidebar = ({ 
  activeTab, 
  setActiveTab, 
  currentUser, 
  onLogout,
  logoUrl
}: { 
  activeTab: string, 
  setActiveTab: (t: string) => void,
  currentUser: User,
  onLogout: () => void,
  logoUrl: string | null
}) => {
  return (
    <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200 h-screen sticky top-0">
      {/* Logo Area */}
      <div className="p-6 border-b border-slate-100 flex flex-col items-center">
        {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-16 w-auto object-contain mb-2" />
        ) : (
            <div className="w-12 h-12 bg-slate-900 text-white rounded-full flex items-center justify-center font-bold text-xl mb-2">UP</div>
        )}
        <span className="font-bold text-lg text-slate-800">UpFest Control</span>
      </div>

      {/* User Info */}
      <div className="p-4 bg-slate-50 border-b border-slate-100">
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
                 {currentUser.referenceImage ? (
                    <img src={currentUser.referenceImage} className="w-full h-full object-cover" alt="Avatar"/>
                 ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400"><UserIcon size={20}/></div>
                 )}
            </div>
            <div className="overflow-hidden">
                <p className="font-bold text-slate-800 text-sm truncate">{currentUser.name}</p>
                <p className="text-xs text-slate-500 truncate">{currentUser.role}</p>
            </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        <button
            onClick={() => setActiveTab('clock')}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'clock' || activeTab === 'self-clock'
                ? 'bg-orange-50 text-orange-700' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
        >
            <Clock size={20}/>
            Fichadas
        </button>

        {currentUser.role === Role.ADMIN && (
            <>
                <button
                    onClick={() => setActiveTab('monitor')}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                        activeTab === 'monitor' 
                        ? 'bg-orange-50 text-orange-700' 
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                >
                    <LayoutDashboard size={20}/>
                    Monitor Sucursales
                </button>

                <button
                    onClick={() => setActiveTab('admin')}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                        activeTab === 'admin' 
                        ? 'bg-orange-50 text-orange-700' 
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                >
                    <Users size={20}/>
                    Usuarios
                </button>

                <button
                    onClick={() => setActiveTab('locations')}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                        activeTab === 'locations' 
                        ? 'bg-orange-50 text-orange-700' 
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                >
                    <Building size={20}/>
                    Salones
                </button>

                <button
                    onClick={() => setActiveTab('config')}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                        activeTab === 'config' 
                        ? 'bg-orange-50 text-orange-700' 
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                >
                    <Settings size={20}/>
                    Configuración
                </button>
            </>
        )}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-slate-100">
        <button 
            onClick={onLogout} 
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
        >
            <LogOut size={20} />
            Cerrar Sesión
        </button>
      </div>
    </aside>
  );
};

const MobileHeader = ({ 
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
    <header className="bg-white shadow-sm sticky top-0 z-50 md:hidden">
      <div className="px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
              {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="h-8 w-auto object-contain" />
              ) : (
                  <div className="w-8 h-8 bg-slate-900 text-white rounded-full flex items-center justify-center font-bold text-sm">UP</div>
              )}
              <span className="font-bold text-lg text-slate-800">UpFest</span>
          </div>
        
          {currentUser && (
              <button 
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-md focus:outline-none"
              >
                {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
          )}
      </div>

      {/* Mobile Menu Dropdown */}
      {currentUser && isMobileMenuOpen && (
        <div className="bg-white border-t border-gray-100 shadow-lg px-4 pt-2 pb-4 space-y-2 absolute w-full left-0 z-40">
            <div className="px-3 py-2 border-b border-gray-100 mb-2 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden">
                     {currentUser.referenceImage ? (
                        <img src={currentUser.referenceImage} className="w-full h-full object-cover" alt="Avatar"/>
                     ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400"><UserIcon size={16}/></div>
                     )}
                </div>
                <div>
                    <span className="block text-sm font-bold text-gray-800">{currentUser.name}</span>
                    <span className="block text-xs text-gray-500">{currentUser.role}</span>
                </div>
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
                        onClick={() => { setActiveTab('monitor'); setIsMobileMenuOpen(false); }}
                        className={`w-full text-left px-3 py-3 rounded-lg text-base font-medium flex items-center gap-3 transition-colors ${
                            activeTab === 'monitor' 
                            ? 'bg-orange-50 text-orange-700' 
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                    >
                        <LayoutDashboard size={20}/> Monitor Sucursales
                    </button>

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
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50">
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

// --- User Form Component ---

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

// --- Monitor Dashboard ---

interface MonitorStat {
    location: Location;
    assignedUsers: User[];
    presentCount: number;
    expectedCount: number;
    usersStatus: {
        user: User;
        status: 'PRESENT' | 'ABSENT' | 'NO_SHIFT';
        lastLog?: LogEntry;
        shift?: string;
    }[];
}

const MonitorDashboard = () => {
    const [stats, setStats] = useState<MonitorStat[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedLocation, setSelectedLocation] = useState<MonitorStat | null>(null);

    useEffect(() => {
        const loadData = async () => {
            const [users, locations, todayLogs] = await Promise.all([
                fetchUsers(),
                fetchLocations(),
                fetchTodayLogs()
            ]);

            const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
            const todayName = days[new Date().getDay()];

            const newStats: MonitorStat[] = locations.map(loc => {
                // Users assigned to this location
                const locUsers = users.filter(u => u.assignedLocations?.includes(loc.id));
                
                // Calculate status for each user
                const usersStatus = locUsers.map(u => {
                    const todaySchedule = u.schedule?.find(s => s.day === todayName);
                    const lastLog = todayLogs.find(l => l.userId === u.id); // Assuming logs sorted desc
                    
                    let status: 'PRESENT' | 'ABSENT' | 'NO_SHIFT' = 'NO_SHIFT';
                    
                    if (todaySchedule) {
                        if (lastLog && lastLog.type === 'CHECK_IN') {
                            status = 'PRESENT';
                        } else {
                            status = 'ABSENT';
                        }
                    }

                    return {
                        user: u,
                        status,
                        lastLog,
                        shift: todaySchedule ? `${todaySchedule.start} - ${todaySchedule.end}` : undefined
                    };
                });

                const presentCount = usersStatus.filter(s => s.status === 'PRESENT').length;
                // Expected count includes anyone with a shift today, regardless of current time (simplified)
                const expectedCount = usersStatus.filter(s => s.status !== 'NO_SHIFT').length;

                return {
                    location: loc,
                    assignedUsers: locUsers,
                    presentCount,
                    expectedCount,
                    usersStatus
                };
            });

            setStats(newStats);
            setLoading(false);
        };

        loadData();
        const interval = setInterval(loadData, 10000); // Refresh every 10s
        return () => clearInterval(interval);
    }, []);

    if (selectedLocation) {
        return (
            <div className="max-w-7xl mx-auto p-6">
                <button 
                    onClick={() => setSelectedLocation(null)}
                    className="flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-6 transition"
                >
                    <ArrowLeft size={20} /> Volver al Monitor
                </button>

                <div className="flex items-center gap-4 mb-6">
                    <h2 className="text-2xl font-bold text-slate-800">{selectedLocation.location.name} <span className="text-lg font-normal text-slate-500">| Monitor de sucursales</span></h2>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-white border-b border-slate-100">
                                    <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider">Nº Legajo</th>
                                    <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider">Apellido</th>
                                    <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider">Nombre</th>
                                    <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider">Puesto de trabajo</th>
                                    <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider">Sucursal habitual</th>
                                    <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider">Horario</th>
                                    <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider">Estado</th>
                                    <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider">Fichó en</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {selectedLocation.usersStatus.map((item, idx) => (
                                    <tr key={item.user.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="py-4 px-6 text-sm text-slate-700">{item.user.legajo || '-'}</td>
                                        <td className="py-4 px-6 text-sm font-medium text-slate-800">{item.user.name.split(' ').slice(1).join(' ')}</td>
                                        <td className="py-4 px-6 text-sm text-slate-700">{item.user.name.split(' ')[0]}</td>
                                        <td className="py-4 px-6 text-sm text-slate-600">{item.user.role}</td>
                                        <td className="py-4 px-6 text-sm text-slate-600">{selectedLocation.location.name}</td>
                                        <td className="py-4 px-6 text-sm text-slate-600">
                                            {item.shift ? `${new Date().toLocaleDateString()} ${item.shift}` : '-'}
                                        </td>
                                        <td className="py-4 px-6">
                                            <span className={`text-sm font-bold ${
                                                item.status === 'PRESENT' ? 'text-green-600' :
                                                item.status === 'ABSENT' ? 'text-red-500' : 'text-slate-400'
                                            }`}>
                                                {item.status === 'PRESENT' ? 'Presente' : 
                                                 item.status === 'ABSENT' ? 'Ausente' : 'Sin Turno'}
                                            </span>
                                        </td>
                                        <td className="py-4 px-6 text-sm text-slate-600">
                                            {item.lastLog && item.lastLog.type === 'CHECK_IN' 
                                                ? new Date(item.lastLog.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) 
                                                : ''}
                                        </td>
                                    </tr>
                                ))}
                                {selectedLocation.usersStatus.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="py-8 text-center text-slate-400 text-sm">
                                            No hay usuarios asignados a esta sucursal.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto p-6">
            <h1 className="text-2xl font-bold text-slate-800 mb-6">Monitor de Sucursales</h1>
            
            {loading ? (
                <div className="text-center py-10">
                    <div className="animate-spin w-10 h-10 border-4 border-orange-600 border-t-transparent rounded-full mx-auto"></div>
                    <p className="mt-4 text-slate-500">Cargando estado...</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {stats.map(stat => (
                        <div 
                            key={stat.location.id} 
                            onClick={() => setSelectedLocation(stat)}
                            className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 cursor-pointer hover:shadow-md transition group border-l-4 border-l-green-500"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-green-50 text-green-700 rounded-lg">
                                        <Home size={24} />
                                    </div>
                                    <h3 className="font-bold text-lg text-slate-800 group-hover:text-orange-600 transition">
                                        {stat.location.name}
                                    </h3>
                                </div>
                            </div>
                            
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-slate-600">
                                    {stat.presentCount > 0 ? 'Abierta' : 'Sin actividad reciente'}
                                </p>
                                <p className="text-sm text-slate-500">
                                    Presentes: <span className="font-bold text-slate-800">{stat.presentCount}</span> de {stat.expectedCount}
                                </p>
                            </div>

                            <div className="mt-4 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-green-500 rounded-full transition-all duration-500"
                                    style={{ width: `${stat.expectedCount > 0 ? (stat.presentCount / stat.expectedCount) * 100 : 0}%` }}
                                ></div>
                            </div>
                        </div>
                    ))}
                    {stats.length === 0 && (
                        <div className="col-span-full text-center py-10 text-slate-400">
                            No hay sucursales configuradas.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// --- Config Dashboard ---

const ConfigDashboard = ({ onLogoUpdate }: { onLogoUpdate: () => void }) => {
    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [pendingBase64, setPendingBase64] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');

    useEffect(() => {
        fetchCompanyLogo().then(url => {
            setLogoUrl(url);
            setPreviewUrl(url);
        });
    }, []);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                setPreviewUrl(result);
                setPendingBase64(result);
                setSuccessMsg('');
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = async () => {
        if (!pendingBase64) return;
        setLoading(true);
        const newUrl = await saveCompanyLogo(pendingBase64);
        if (newUrl) {
            setLogoUrl(newUrl);
            setPendingBase64(null); // Reset pending state
            setSuccessMsg('Logo actualizado correctamente.');
            onLogoUpdate(); // Refresh header
        } else {
            setSuccessMsg('Error al guardar el logo.');
        }
        setLoading(false);
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
                        <div className="w-32 h-32 bg-slate-100 rounded-full flex items-center justify-center overflow-hidden border-2 border-slate-200 relative">
                            {previewUrl ? (
                                <img src={previewUrl} alt="Logo Empresa" className="w-full h-full object-contain p-2" />
                            ) : (
                                <span className="text-slate-400 font-bold text-2xl">LOGO</span>
                            )}
                        </div>
                    </div>
                    <div className="flex-1 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Cargar Logo de la Empresa
                            </label>
                            <p className="text-sm text-slate-500 mb-4">
                                Este logo se mostrará en la pantalla de inicio de sesión y en la barra superior.
                                Se recomienda una imagen en formato PNG con fondo transparente.
                            </p>
                            <label className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer">
                                <Upload size={18} />
                                Seleccionar Archivo
                                <input type="file" accept="image/*" className="hidden" onChange={handleFileSelect} disabled={loading} />
                            </label>
                        </div>

                        {pendingBase64 && (
                            <div className="pt-2">
                                <button 
                                    onClick={handleSave}
                                    disabled={loading}
                                    className={`inline-flex items-center gap-2 px-6 py-2 rounded-lg font-bold transition shadow-md ${loading ? 'bg-slate-400 cursor-not-allowed text-white' : 'bg-green-600 hover:bg-green-700 text-white'}`}
                                >
                                    {loading ? (
                                        <>
                                            <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                                            Guardando...
                                        </>
                                    ) : (
                                        <>
                                            <Save size={18} />
                                            Guardar Cambios
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                        
                        {successMsg && (
                            <div className={`text-sm font-medium p-2 rounded ${successMsg.includes('Error') ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50'}`}>
                                {successMsg}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Main Components ---

const ClockInModule = ({ user, onFinished }: { user: User, onFinished: () => void }) => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [step, setStep] = useState<'DASHBOARD' | 'OFF_SCHEDULE_WARNING' | 'VALIDATING_LOC' | 'CAMERA' | 'PROCESSING' | 'RESULT' | 'SUCCESS' | 'PERMISSION_DENIED'>('DASHBOARD');
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
      
      const onSchedule = isWithinSchedule(user.schedule);
      
      // LOGIC OVERRIDE: If role is EXTRA_WAITER, skip camera and AI analysis
      if (user.role === Role.EXTRA_WAITER) {
          setResult({
            id: crypto.randomUUID(), userId: user.id, userName: user.name, legajo: user.legajo, timestamp: new Date().toISOString(), type,
            locationId: (nearestLoc as Location).id, locationName: (nearestLoc as Location).name, locationStatus: isInside ? 'VALID' : 'INVALID',
            scheduleStatus: onSchedule ? 'ON_TIME' : 'OFF_SCHEDULE', 
            dressCodeStatus: 'SKIPPED', identityStatus: 'SKIPPED', 
            photoEvidence: '', aiFeedback: 'Validación biométrica omitida por rol eventual.'
          });
          setStep('RESULT');
      } else {
          setStep('CAMERA');
          setResult({
            id: crypto.randomUUID(), userId: user.id, userName: user.name, legajo: user.legajo, timestamp: new Date().toISOString(), type,
            locationId: (nearestLoc as Location).id, locationName: (nearestLoc as Location).name, locationStatus: isInside ? 'VALID' : 'INVALID',
            scheduleStatus: onSchedule ? 'ON_TIME' : 'OFF_SCHEDULE', dressCodeStatus: 'FAIL', identityStatus: 'NO_MATCH', photoEvidence: '', aiFeedback: ''
          });
      }
    } catch (err: any) {
      if (err.code === 1 || err.message.includes('permission')) {
          setStep('PERMISSION_DENIED');
      } else {
          alert("Error GPS: " + err.message);
          setStep('DASHBOARD');
      }
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
      setResult(finalEntry);
      setStep('RESULT');
    } catch (err) { setStep('DASHBOARD'); }
  };
  
  const triggerSuccessSequence = async (entry: LogEntry) => {
      await addLog(entry);
      setStep('SUCCESS');
      
      setTimeout(() => {
          onFinished();
      }, 3000);
  }
  
  const handleFinalSave = async () => {
      if (result) {
          triggerSuccessSequence(result);
      }
  };
  
  const handleRetryPhoto = () => {
      setStep('CAMERA');
  };
  
  const handleSaveWithIncident = async () => {
      if (result) {
          triggerSuccessSequence(result);
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

  const delayInfo = getScheduleDelayInfo(user.schedule);

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

      {step === 'PERMISSION_DENIED' && (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center border-t-4 border-red-500">
             <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
                <MapPin size={32} />
             </div>
             <h2 className="text-xl font-bold text-slate-900 mb-2">Habilitar Ubicación</h2>
             <p className="text-slate-600 mb-4 text-sm">
                Para fichar, necesitamos confirmar que estás en el salón. Tu navegador ha bloqueado el acceso al GPS.
             </p>
             <div className="bg-slate-50 p-4 rounded-lg text-left text-xs text-slate-700 mb-6 space-y-2 border border-slate-100">
                <p className="font-bold">Cómo activarlo en iPhone (Safari):</p>
                <ol className="list-decimal list-inside space-y-1 ml-1">
                    <li>Toca el icono <strong>"aA"</strong> en la barra de dirección (abajo o arriba).</li>
                    <li>Selecciona <strong>Configuración del sitio web</strong>.</li>
                    <li>Toca en <strong>Ubicación</strong> y selecciona <strong>Permitir</strong>.</li>
                </ol>
             </div>
             <div className="space-y-3">
                 <button 
                    onClick={() => pendingAction && proceedToLocationCheck(pendingAction)}
                    className="w-full bg-orange-600 text-white py-3 rounded-lg font-bold hover:bg-orange-700 transition"
                 >
                    Reintentar Validación
                 </button>
                 <button 
                    onClick={reset}
                    className="w-full bg-white text-slate-600 border border-slate-200 py-3 rounded-lg font-bold hover:bg-slate-50 transition"
                 >
                    Cancelar
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
                  {result.photoEvidence ? (
                      <img src={result.photoEvidence} className="w-24 h-24 rounded-full mx-auto object-cover border-4 border-slate-100" alt="evidencia" />
                  ) : (
                      <div className="w-24 h-24 bg-slate-100 rounded-full mx-auto flex items-center justify-center text-slate-400 border-4 border-slate-50">
                          <UserIcon size={40} />
                      </div>
                  )}
                  <div className="space-y-2 text-left bg-slate-50 p-4 rounded-lg">
                       <div className="flex justify-between border-b pb-2">
                           <span className="text-slate-500 text-sm">Horario</span>
                           <div className="text-right">
                               <span className="font-mono font-bold text-slate-800 block">{new Date(result.timestamp).toLocaleTimeString()}</span>
                               {delayInfo && (
                                   <span className="text-xs text-orange-600 font-medium block">{delayInfo}</span>
                               )}
                           </div>
                       </div>
                       <div className="flex justify-between border-b pb-2">
                           <span className="text-slate-500 text-sm">Estado Horario</span>
                           <span className={`font-bold text-sm ${delayInfo ? 'text-orange-600' : (result.scheduleStatus === 'ON_TIME' ? 'text-green-600' : 'text-red-500')}`}>
                               {delayInfo ? 'Llegada Tarde' : (result.scheduleStatus === 'ON_TIME' ? 'En Horario' : 'Fuera de Horario')}
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
                       <div className="flex justify-between border-b pb-2">
                           <span className="text-slate-500 text-sm">Biometría</span>
                           <span className={`font-bold text-sm ${result.identityStatus === 'MATCH' ? 'text-green-600' : (result.identityStatus === 'SKIPPED' ? 'text-slate-400' : 'text-red-500')}`}>
                               {result.identityStatus === 'MATCH' ? 'Aprobada' : (result.identityStatus === 'SKIPPED' ? 'Omitida' : 'Revisar')}
                           </span>
                       </div>
                       <div className="flex justify-between pb-2">
                           <span className="text-slate-500 text-sm">Vestimenta</span>
                           <span className={`font-bold text-sm ${result.dressCodeStatus === 'PASS' ? 'text-green-600' : (result.dressCodeStatus === 'SKIPPED' ? 'text-slate-400' : 'text-orange-600')}`}>
                               {result.dressCodeStatus === 'PASS' ? 'Correcta' : (result.dressCodeStatus === 'SKIPPED' ? 'Omitida' : 'Incorrecta')}
                           </span>
                       </div>
                  </div>

                  <div className="mt-4 bg-slate-100 p-3 rounded-lg text-left border border-slate-200">
                      <p className="text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                          <Eye size={12}/> Detalle de Análisis (IA)
                      </p>
                      <p className="text-sm text-slate-700 leading-snug">
                          {result.aiFeedback || "Sin detalles adicionales."}
                      </p>
                  </div>
                  
                  {/* Actions based on result */}
                  {(result.identityStatus === 'MATCH' || result.identityStatus === 'SKIPPED') ? (
                      <button onClick={handleFinalSave} className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold mt-4">
                          Finalizar
                      </button>
                  ) : (
                      <div className="space-y-3 mt-4">
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

      {step === 'SUCCESS' && result && (
        <div className="bg-white rounded-2xl shadow-lg p-12 text-center animate-in fade-in zoom-in duration-300">
            <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle size={48} />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">¡Perfecto!</h2>
            <p className="text-slate-600 text-lg leading-relaxed">
                Se guardó tu fichada de <span className="font-bold text-slate-900">{result.type === 'CHECK_IN' ? 'Ingreso' : 'Egreso'}</span> para el <span className="font-bold text-slate-900">{new Date(result.timestamp).toLocaleDateString()}</span> a las <span className="font-bold text-slate-900">{new Date(result.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </p>
            <div className="mt-8">
                <p className="text-sm text-slate-400 italic">Cerrando sesión en 3 segundos...</p>
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
    const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);

    const loadLogs = async () => {
        setLoading(true);
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        
        const fetchedLogs = await fetchLogsByDateRange(start, end);
        setLogs(fetchedLogs);
        setLoading(false);
    }

    useEffect(() => {
        loadLogs();
    }, []);

    const handleSearch = () => {
        loadLogs();
    }

    const handleExportCSV = () => {
        const headers = ["Legajo", "Nombre", "Tipo", "Fecha", "Hora", "Salón", "Estado Ubicación", "Estado Biometría", "Foto URL"];
        const rows = logs.map(log => [
            log.legajo,
            log.userName,
            log.type === 'CHECK_IN' ? 'ENTRADA' : 'SALIDA',
            new Date(log.timestamp).toLocaleDateString(),
            new Date(log.timestamp).toLocaleTimeString(),
            log.locationName,
            log.locationStatus,
            log.identityStatus,
            log.photoEvidence
        ]);

        const csvContent = [
            headers.join(','), 
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `fichadas_${startDate}_al_${endDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setShowExportMenu(false);
    };

    const handleExportExcel = () => {
        const workSheetData = logs.map(log => ({
            "Legajo": log.legajo,
            "Nombre": log.userName,
            "Tipo": log.type === 'CHECK_IN' ? 'ENTRADA' : 'SALIDA',
            "Fecha": new Date(log.timestamp).toLocaleDateString(),
            "Hora": new Date(log.timestamp).toLocaleTimeString(),
            "Salón": log.locationName,
            "Estado Ubicación": log.locationStatus,
            "Estado Biometría": log.identityStatus,
            "Link Foto": log.photoEvidence
        }));

        const ws = XLSX.utils.json_to_sheet(workSheetData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Fichadas");
        XLSX.writeFile(wb, `Reporte_Fichadas_${startDate}_al_${endDate}.xlsx`);
        setShowExportMenu(false);
    };

    const handleExportPDF = () => {
        const doc = new jsPDF();
        
        doc.setFontSize(18);
        doc.text("Reporte de Asistencia", 14, 20);
        
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Desde: ${new Date(startDate).toLocaleDateString()}  Hasta: ${new Date(endDate).toLocaleDateString()}`, 14, 28);
        
        const tableBody = logs.map(log => [
            log.legajo,
            log.userName,
            log.type === 'CHECK_IN' ? 'ENTRADA' : 'SALIDA',
            new Date(log.timestamp).toLocaleDateString() + ' ' + new Date(log.timestamp).toLocaleTimeString(),
            log.locationName,
            log.locationStatus === 'VALID' ? 'OK' : 'INVALID'
        ]);

        autoTable(doc, {
            head: [['Legajo', 'Nombre', 'Tipo', 'Fecha/Hora', 'Salón', 'Ubicación']],
            body: tableBody,
            startY: 35,
            theme: 'striped',
            headStyles: { fillColor: [234, 88, 12] },
        });

        doc.save(`Reporte_Fichadas_${startDate}_al_${endDate}.pdf`);
        setShowExportMenu(false);
    };

    const getShortHash = (id: string) => id.substring(0, 16);

    return (
        <div className="max-w-7xl mx-auto p-6">
            <h1 className="text-2xl font-bold text-slate-800 mb-6">Historial de Fichadas</h1>
            
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6 flex flex-col md:flex-row items-end gap-4">
                <div className="flex flex-col gap-1 w-full md:w-auto">
                    <label className="text-xs font-bold text-slate-500 uppercase">Desde</label>
                    <div className="relative">
                        <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                            type="date" 
                            value={startDate} 
                            onChange={(e) => setStartDate(e.target.value)}
                            className="pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-orange-500 w-full"
                        />
                    </div>
                </div>
                <div className="flex flex-col gap-1 w-full md:w-auto">
                    <label className="text-xs font-bold text-slate-500 uppercase">Hasta</label>
                    <div className="relative">
                        <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                            type="date" 
                            value={endDate} 
                            onChange={(e) => setEndDate(e.target.value)}
                            className="pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-orange-500 w-full"
                        />
                    </div>
                </div>
                
                <button 
                    onClick={handleSearch}
                    className="w-full md:w-auto px-4 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition flex items-center justify-center gap-2"
                >
                    <Search size={18} /> Filtrar
                </button>

                <div className="flex-1 md:text-right w-full md:w-auto relative">
                    <button 
                        onClick={() => setShowExportMenu(!showExportMenu)}
                        className="w-full md:w-auto px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition flex items-center justify-center gap-2 ml-auto"
                        disabled={logs.length === 0}
                    >
                        <Download size={18} /> Exportar
                    </button>

                    {showExportMenu && (
                        <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-xl border border-slate-100 z-50 overflow-hidden">
                            <button 
                                onClick={handleExportCSV}
                                className="w-full text-left px-4 py-3 hover:bg-slate-50 text-slate-700 text-sm flex items-center gap-2 border-b border-slate-50"
                            >
                                <FileText size={16} /> CSV (Texto plano)
                            </button>
                            <button 
                                onClick={handleExportExcel}
                                className="w-full text-left px-4 py-3 hover:bg-slate-50 text-slate-700 text-sm flex items-center gap-2 border-b border-slate-50"
                            >
                                <FileSpreadsheet size={16} /> Excel (.xlsx)
                            </button>
                            <button 
                                onClick={handleExportPDF}
                                className="w-full text-left px-4 py-3 hover:bg-slate-50 text-slate-700 text-sm flex items-center gap-2"
                            >
                                <File size={16} /> PDF (Documento)
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="flex flex-col divide-y divide-slate-100">
                    {loading && (
                        <div className="p-8 text-center text-slate-500">
                             <div className="animate-spin w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full mx-auto mb-2"></div>
                             Cargando registros...
                        </div>
                    )}

                    {!loading && logs.map(log => (
                        <div 
                            key={log.id} 
                            onClick={() => setSelectedLog(log)}
                            className="flex items-center p-4 hover:bg-slate-50 transition-colors cursor-pointer gap-4"
                        >
                            <div className="flex-shrink-0">
                                {log.photoEvidence ? (
                                    <img 
                                        src={log.photoEvidence} 
                                        className="w-12 h-12 rounded bg-slate-200 object-cover" 
                                        alt="Evidence" 
                                    />
                                ) : (
                                    <div className="w-12 h-12 rounded bg-slate-100 flex items-center justify-center text-slate-300">
                                        <UserIcon size={20} />
                                    </div>
                                )}
                            </div>

                            <div className="w-20 text-sm font-medium text-orange-700 hidden sm:block">
                                {log.legajo || log.userId.substring(0,6)}
                            </div>

                            <div className="flex-1 min-w-[150px]">
                                <div className="font-bold text-slate-800 text-sm">{log.userName}</div>
                            </div>

                            <div className="w-32 text-xs text-slate-400 font-mono hidden md:block truncate">
                                {getShortHash(log.id)}
                            </div>

                            <div className="text-orange-600 hidden sm:block">
                                <MapPin size={18} />
                            </div>

                            <div className="w-32 hidden lg:block text-right">
                                <span className="text-xs font-bold text-orange-700">ONLINE-AUTOMATIC</span>
                            </div>

                            <div className="w-32 text-right">
                                <div className="text-xs text-slate-500">{new Date(log.timestamp).toLocaleDateString()}</div>
                                <div className="text-sm font-bold text-slate-800">{new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                            </div>
                            
                            <div className="w-40 text-right text-xs text-slate-600 font-medium hidden md:block truncate pl-2">
                                {log.locationName}
                            </div>
                        </div>
                    ))}
                    
                    {!loading && logs.length === 0 && (
                        <div className="p-8 text-center text-slate-400 text-sm">
                            No se encontraron fichadas en el rango seleccionado.
                        </div>
                    )}
                </div>
            </div>

            {selectedLog && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col">
                        <div className="p-4 border-b flex justify-between items-center">
                            <h3 className="text-xl font-bold text-slate-800">Reporte detalle</h3>
                            <button onClick={() => setSelectedLog(null)} className="text-slate-400 hover:text-slate-600">
                                <X size={24} />
                            </button>
                        </div>
                        
                        <div className="flex flex-col md:flex-row p-6 gap-8">
                            <div className="w-full md:w-5/12">
                                <div className="aspect-[3/4] bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                                    {selectedLog.photoEvidence ? (
                                        <img 
                                            src={selectedLog.photoEvidence} 
                                            className="w-full h-full object-cover" 
                                            alt="Evidencia Grande" 
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-300 bg-slate-50">
                                            <div className="text-center">
                                                <UserIcon size={64} className="mx-auto mb-2 opacity-20" />
                                                <p className="text-xs font-bold uppercase tracking-widest">Sin Foto</p>
                                                <p className="text-[10px] text-slate-400 mt-1">Personal Eventual</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="w-full md:w-7/12 flex flex-col gap-4">
                                <div className="grid grid-cols-[120px_1fr] gap-y-3 text-sm">
                                    <div className="text-slate-500">Documento:</div>
                                    <div className="font-medium text-slate-800">{selectedLog.legajo}</div>

                                    <div className="text-slate-500">Nombre:</div>
                                    <div className="font-medium text-slate-800">{selectedLog.userName}</div>

                                    <div className="text-slate-500">Dispositivo:</div>
                                    <div className="font-medium text-slate-800 font-mono text-xs">{selectedLog.id.substring(0, 16)}</div>

                                    <div className="text-slate-500">Tipo de marca:</div>
                                    <div className="font-bold uppercase text-slate-800">
                                        {selectedLog.type === 'CHECK_IN' ? 'ENTRADA' : 'SALIDA'}
                                    </div>

                                    <div className="text-slate-500">Certeza:</div>
                                    <div className={`font-bold ${selectedLog.identityStatus === 'MATCH' ? 'text-green-600' : (selectedLog.identityStatus === 'SKIPPED' ? 'text-slate-400' : 'text-red-600')}`}>
                                        {selectedLog.identityStatus === 'MATCH' ? 'Identificado' : (selectedLog.identityStatus === 'SKIPPED' ? 'Omitido (Mozo Extra)' : 'No identificado')}
                                    </div>

                                    <div className="text-slate-500">Fecha:</div>
                                    <div className="font-medium text-slate-800">{new Date(selectedLog.timestamp).toLocaleDateString()}</div>

                                    <div className="text-slate-500">Hora:</div>
                                    <div className="font-medium text-slate-800">{new Date(selectedLog.timestamp).toLocaleTimeString()}</div>

                                    <div className="text-slate-500">Ubicación:</div>
                                    <div className="font-medium text-slate-800">{selectedLog.locationName}</div>
                                </div>

                                <div className="mt-4 flex-1 min-h-[150px] bg-slate-100 rounded-lg overflow-hidden border border-slate-200 relative">
                                    <div className="w-full h-full bg-slate-200 flex items-center justify-center relative overflow-hidden">
                                         <div className="absolute inset-0 opacity-50 bg-[url('https://upload.wikimedia.org/wikipedia/commons/e/ec/World_map_blank_without_borders.svg')] bg-cover bg-center"></div>
                                         <div className="z-10 flex flex-col items-center">
                                             <MapPin size={32} className="text-red-600 drop-shadow-lg" fill="currentColor" />
                                             <span className="text-xs font-bold text-slate-700 bg-white/80 px-2 py-1 rounded mt-1">
                                                 {selectedLog.locationName}
                                             </span>
                                         </div>
                                    </div>
                                    <a href="#" className="absolute bottom-2 left-2 flex items-center gap-1 text-orange-700 text-xs font-bold bg-white/90 px-2 py-1 rounded shadow-sm hover:bg-white">
                                        <MapPin size={12} /> Ver mapa
                                    </a>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t bg-slate-50 flex justify-end">
                             <button 
                                onClick={() => setSelectedLog(null)}
                                className="px-6 py-2 bg-white border border-slate-300 rounded text-slate-700 hover:bg-slate-100 font-medium transition"
                             >
                                 Cerrar
                             </button>
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

  useEffect(() => {
    fetchCompanyLogo().then(setLogoUrl);
  }, []);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <LoginView 
            onLogin={(user) => { setCurrentUser(user); setActiveTab(user.role === Role.ADMIN ? 'admin' : 'clock'); }} 
            logoUrl={logoUrl}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar 
          activeTab={activeTab} 
          setActiveTab={setActiveTab} 
          currentUser={currentUser} 
          onLogout={() => setCurrentUser(null)} 
          logoUrl={logoUrl}
      />

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
          <MobileHeader 
            activeTab={activeTab} 
            setActiveTab={setActiveTab} 
            currentUser={currentUser}
            onLogout={() => setCurrentUser(null)}
            logoUrl={logoUrl}
          />
          
          <main className="flex-1 overflow-y-auto bg-slate-50">
            {activeTab === 'clock' && currentUser.role !== Role.ADMIN && (
              <ClockInModule user={currentUser} onFinished={() => setCurrentUser(null)} />
            )}
            {activeTab === 'clock' && currentUser.role === Role.ADMIN && (
                <div className="flex flex-col gap-6">
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
              <ClockInModule user={currentUser} onFinished={() => { setActiveTab('admin'); }} />
            )}
            
            {activeTab === 'monitor' && currentUser.role === Role.ADMIN && (
              <MonitorDashboard />
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
    </div>
  );
}