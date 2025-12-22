
import React, { useState, useEffect, useRef } from 'react';
import { 
  Role, Location, User, LogEntry, WorkSchedule, Incident 
} from './types';
import { 
  getCurrentPosition, calculateDistance, isWithinSchedule, getScheduleDelayInfo,
  fetchUsers, fetchLocations, fetchLogs, fetchTodayLogs, fetchLogsByDateRange, addLog, saveUser, deleteUser,
  authenticateUser, saveLocation, deleteLocation, fetchCompanyLogo, saveCompanyLogo,
  fetchIncidents, saveIncident, deleteIncident
} from './services/utils';
import { analyzeCheckIn, generateIncidentExplanation } from './services/geminiService';
import { 
  Camera, User as UserIcon, Shield, Clock, 
  LogOut, CheckCircle, XCircle, AlertTriangle, Plus, Save, Lock, Hash, Upload, Trash2, Ban, Image as ImageIcon, Pencil, X, RotateCcw, Home, FileText, Users, Building, MapPin, Map, Eye, Menu, Settings, ChevronRight, LayoutDashboard, ArrowLeft, Calendar, Download, Search, Filter, FileSpreadsheet, File, Wallet, AlertCircle, TrendingDown, TrendingUp, Sparkles, MapPinned
} from 'lucide-react';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';

// --- Forms ---

const UserForm = ({ initialData, onSubmit, onCancel }: { initialData?: User | null, onSubmit: (u: User) => void, onCancel: () => void }) => {
  const [formData, setFormData] = useState<User>({
    id: '', name: '', dni: '', password: '', role: Role.WAITER, dressCode: '', legajo: '', schedule: [],
    referenceImage: null, assignedLocations: [], hourlyRate: 0,
    ...initialData
  });
  const [imagePreview, setImagePreview] = useState<string | null>(initialData?.referenceImage || null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const [editingDay, setEditingDay] = useState('Viernes');
  const [startTime, setStartTime] = useState('20:00');
  const [endTime, setEndTime] = useState('04:00');

  useEffect(() => { fetchLocations().then(setLocations); }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
        setFormData(prev => ({ ...prev, referenceImage: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleLocation = (locId: string) => {
    const current = formData.assignedLocations || [];
    setFormData(prev => ({ ...prev, assignedLocations: current.includes(locId) ? current.filter(id => id !== locId) : [...current, locId] }));
  };

  const addSchedule = () => {
    const newSchedule = [...formData.schedule.filter(s => s.day !== editingDay), { day: editingDay, start: startTime, end: endTime }];
    setFormData(prev => ({ ...prev, schedule: newSchedule }));
  };

  const removeSchedule = (day: string) => {
    setFormData(prev => ({ ...prev, schedule: prev.schedule.filter(s => s.day !== day) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[80vh] overflow-y-auto pr-2 custom-scrollbar">
      <div className="grid grid-cols-2 gap-4">
        <div><label className="text-xs font-bold text-slate-500 uppercase">DNI</label><input type="text" value={formData.dni} onChange={e => setFormData({...formData, dni: e.target.value})} className="w-full border border-slate-200 rounded-lg p-2 text-sm" required /></div>
        <div><label className="text-xs font-bold text-slate-500 uppercase">Legajo</label><input type="text" value={formData.legajo} onChange={e => setFormData({...formData, legajo: e.target.value})} className="w-full border border-slate-200 rounded-lg p-2 text-sm" /></div>
      </div>
      <div><label className="text-xs font-bold text-slate-500 uppercase">Nombre Completo</label><input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border border-slate-200 rounded-lg p-2 text-sm" required /></div>
      
      <div className="grid grid-cols-2 gap-4">
          <div><label className="text-xs font-bold text-slate-500 uppercase">Rol</label>
              <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as Role})} className="w-full border border-slate-200 rounded-lg p-2 text-sm">
                  {Object.values(Role).map(r => <option key={r} value={r}>{r}</option>)}
              </select>
          </div>
          <div><label className="text-xs font-bold text-slate-500 uppercase">Valor Hora ($)</label><input type="number" value={formData.hourlyRate} onChange={e => setFormData({...formData, hourlyRate: parseFloat(e.target.value)})} className="w-full border border-slate-200 rounded-lg p-2 text-sm" /></div>
      </div>

      <div><label className="text-xs font-bold text-slate-500 uppercase">Indicaciones de Vestimenta</label><textarea value={formData.dressCode} onChange={e => setFormData({...formData, dressCode: e.target.value})} className="w-full border border-slate-200 rounded-lg p-2 text-sm" placeholder="Ej: Camisa blanca, pantalón negro..." rows={2} /></div>

      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
          <label className="text-xs font-bold text-slate-500 uppercase mb-3 block">Horarios</label>
          <div className="flex gap-2 mb-3">
              <select value={editingDay} onChange={e => setEditingDay(e.target.value)} className="flex-1 text-xs border border-slate-200 rounded p-1">{days.map(d => <option key={d}>{d}</option>)}</select>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="text-xs border border-slate-200 rounded p-1 w-20" />
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="text-xs border border-slate-200 rounded p-1 w-20" />
              <button type="button" onClick={addSchedule} className="p-1 bg-slate-900 text-white rounded"><Plus size={16}/></button>
          </div>
          <div className="space-y-1">
              {formData.schedule.map(s => (
                  <div key={s.day} className="flex justify-between items-center text-xs bg-white p-2 rounded border border-slate-100">
                      <span className="font-bold">{s.day}:</span> <span>{s.start} a {s.end}</span>
                      <button type="button" onClick={() => removeSchedule(s.day)} className="text-red-400 hover:text-red-600"><Trash2 size={12}/></button>
                  </div>
              ))}
          </div>
      </div>

      <div><label className="text-xs font-bold text-slate-500 uppercase">Contraseña</label><input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full border border-slate-200 rounded-lg p-2 text-sm" required /></div>
      
      <div>
         <label className="text-xs font-bold text-slate-500 uppercase">Biometría (Referencia)</label>
         <input type="file" onChange={handleImageUpload} className="block w-full text-xs mt-1" />
         {imagePreview && <img src={imagePreview} className="mt-2 w-20 h-20 rounded-lg object-cover border" alt="Preview" />}
      </div>

      <div>
        <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Salones</label>
        <div className="flex flex-wrap gap-2">
            {locations.map(loc => (
                <button key={loc.id} type="button" onClick={() => toggleLocation(loc.id)} className={`px-3 py-1 rounded-full text-[10px] font-bold border transition ${formData.assignedLocations?.includes(loc.id) ? 'bg-orange-600 text-white border-orange-700' : 'bg-white text-slate-600 border-slate-200'}`}>
                    {loc.name}
                </button>
            ))}
        </div>
      </div>

      <div className="flex gap-3 pt-4 border-t sticky bottom-0 bg-white z-10">
          <button type="button" onClick={onCancel} disabled={isSubmitting} className="flex-1 px-4 py-3 border border-slate-200 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
          <button type="submit" disabled={isSubmitting} className="flex-1 bg-slate-900 text-white px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition shadow-xl shadow-slate-200 disabled:opacity-50">
            {isSubmitting ? 'Guardando...' : 'Guardar'}
          </button>
      </div>
    </form>
  );
};

const LocationForm = ({ initialData, onSubmit, onCancel }: { initialData?: Location | null, onSubmit: (l: Location) => void, onCancel: () => void }) => {
    const [formData, setFormData] = useState<Location>({
        id: '', name: '', address: '', city: '', lat: 0, lng: 0, radiusMeters: 100,
        ...initialData
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleGetLocation = async () => {
        try {
            const pos = await getCurrentPosition();
            setFormData(prev => ({ ...prev, lat: pos.coords.latitude, lng: pos.coords.longitude }));
        } catch (e) { alert("No se pudo obtener la ubicación actual."); }
    };

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSubmitting) return;
      setIsSubmitting(true);
      try {
        await onSubmit(formData);
      } finally {
        setIsSubmitting(false);
      }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="text-xs font-bold text-slate-500 uppercase">Nombre</label><input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border border-slate-200 rounded-lg p-2 text-sm" required /></div>
            <div><label className="text-xs font-bold text-slate-500 uppercase">Dirección</label><input type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full border border-slate-200 rounded-lg p-2 text-sm" /></div>
            <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs font-bold text-slate-500 uppercase">Latitud</label><input type="number" step="any" value={formData.lat} onChange={e => setFormData({...formData, lat: parseFloat(e.target.value)})} className="w-full border border-slate-200 rounded-lg p-2 text-sm" required /></div>
                <div><label className="text-xs font-bold text-slate-500 uppercase">Longitud</label><input type="number" step="any" value={formData.lng} onChange={e => setFormData({...formData, lng: parseFloat(e.target.value)})} className="w-full border border-slate-200 rounded-lg p-2 text-sm" required /></div>
            </div>
            <button type="button" onClick={handleGetLocation} className="text-xs font-bold text-orange-600 flex items-center gap-1 hover:underline"><MapPin size={14} /> Mi ubicación actual</button>
            <div><label className="text-xs font-bold text-slate-500 uppercase">Radio Tolerancia (m)</label><input type="number" value={formData.radiusMeters} onChange={e => setFormData({...formData, radiusMeters: parseInt(e.target.value)})} className="w-full border border-slate-200 rounded-lg p-2 text-sm" /></div>
            
            <div className="flex gap-3 pt-4 border-t">
                <button type="button" onClick={onCancel} disabled={isSubmitting} className="flex-1 px-4 py-3 border border-slate-200 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-slate-900 text-white px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition shadow-xl shadow-slate-200 disabled:opacity-50">
                  {isSubmitting ? 'Guardando...' : 'Guardar'}
                </button>
            </div>
        </form>
    );
};

// --- Dashboard Components ---

const AdminDashboard = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => { 
    setLoading(true); 
    try { 
      const u = await fetchUsers(); 
      setUsers(u); 
    } catch(e) { 
      console.error("Error cargando usuarios:", e); 
    } finally { 
      setLoading(false); 
    } 
  };
  
  useEffect(() => { load(); }, []);

  const handleSave = async (data: User) => {
    try {
        await saveUser(data);
        setIsCreating(false); 
        setEditingUser(null); 
        load();
    } catch(err: any) { 
        console.error("Error al guardar usuario:", err);
        const msg = err.message || "Fallo desconocido al conectar con Supabase.";
        alert(`Error al guardar: ${msg}`); 
    }
  };

  const handleDelete = async (id: string) => {
      if(confirm('¿Eliminar usuario definitivamente?')) { 
        try {
          await deleteUser(id); 
          load(); 
        } catch(e: any) {
          alert("Error al eliminar: " + (e.message || "Fallo desconocido"));
        }
      }
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter">PERSONAL</h1>
            <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Gestión de RRHH UpFest</p>
          </div>
          <button onClick={() => setIsCreating(true)} className="bg-slate-900 text-white px-6 py-3 rounded-2xl flex items-center gap-2 hover:bg-slate-800 transition shadow-xl shadow-slate-200 font-black text-xs uppercase tracking-widest"><Plus size={18} /> Nuevo Usuario</button>
      </div>
      
      <div className="bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-sm">
         <table className="w-full text-left border-collapse">
            <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Personal</th>
                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Legajo</th>
                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Rol</th>
                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Acciones</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {loading ? (
                    <tr><td colSpan={4} className="p-16 text-center text-slate-400 font-bold italic">Sincronizando con la nube...</td></tr>
                ) : users.length === 0 ? (
                    <tr><td colSpan={4} className="p-16 text-center text-slate-400 font-bold italic">No hay usuarios registrados.</td></tr>
                ) : users.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-6">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-slate-100 overflow-hidden border border-slate-200 shrink-0 shadow-sm">
                                    {u.referenceImage ? <img src={u.referenceImage} className="w-full h-full object-cover" /> : <UserIcon size={20} className="m-auto mt-3 text-slate-300"/>}
                                </div>
                                <div>
                                    <span className="font-black text-slate-800 block tracking-tight">{u.name}</span>
                                    <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider">{u.dni}</span>
                                </div>
                            </div>
                        </td>
                        <td className="p-6 text-sm font-mono font-bold text-slate-500 tracking-tighter">{u.legajo || 'S/L'}</td>
                        <td className="p-6 text-center"><span className="text-[10px] font-black bg-slate-100 text-slate-400 px-3 py-1 rounded-full border border-slate-200 uppercase tracking-tighter">{u.role}</span></td>
                        <td className="p-6 text-right">
                            <div className="flex justify-end gap-2">
                                <button onClick={() => setEditingUser(u)} className="p-3 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-xl transition shadow-sm border border-transparent hover:border-orange-100" title="Editar"><Pencil size={18}/></button>
                                <button onClick={() => handleDelete(u.id)} className="p-3 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition shadow-sm border border-transparent hover:border-red-100" title="Eliminar"><Trash2 size={18}/></button>
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
         </table>
      </div>

      {(isCreating || editingUser) && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-[40px] p-10 w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center mb-8">
                      <div>
                        <h3 className="font-black text-2xl text-slate-900 tracking-tighter">{isCreating ? 'NUEVO USUARIO' : 'EDITAR USUARIO'}</h3>
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Información de Perfil</p>
                      </div>
                      <button onClick={() => { setIsCreating(false); setEditingUser(null); }} className="p-2 bg-slate-50 text-slate-400 hover:text-slate-600 rounded-full"><X/></button>
                  </div>
                  <UserForm initialData={editingUser} onSubmit={handleSave} onCancel={() => { setIsCreating(false); setEditingUser(null); }} />
              </div>
          </div>
      )}
    </div>
  );
};

const LocationsDashboard = () => {
    const [locations, setLocations] = useState<Location[]>([]);
    const [editingLoc, setEditingLoc] = useState<Location | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [loading, setLoading] = useState(true);

    const load = async () => { 
      setLoading(true); 
      try { 
        const l = await fetchLocations(); 
        setLocations(l); 
      } catch(e) { 
        console.error("Error cargando salones:", e); 
      } finally { 
        setLoading(false); 
      } 
    };
    
    useEffect(() => { load(); }, []);

    const handleSave = async (data: Location) => {
        try {
            await saveLocation(data);
            setIsCreating(false); 
            setEditingLoc(null); 
            load();
        } catch(err: any) { 
            console.error("Error al guardar salón:", err);
            const msg = err.message || "Fallo desconocido al conectar con Supabase.";
            alert(`Error al guardar: ${msg}`); 
        }
    };

    const handleDelete = async (id: string) => {
        if(confirm('¿Eliminar salón definitivamente?')) { 
          try {
            await deleteLocation(id); 
            load(); 
          } catch(e: any) {
            alert("Error al eliminar: " + (e.message || "Fallo desconocido"));
          }
        }
    };

    return (
        <div className="max-w-7xl mx-auto p-6">
            <div className="flex justify-between items-center mb-8">
                <div>
                  <h1 className="text-3xl font-black text-slate-900 tracking-tighter">SALONES</h1>
                  <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Sedes UpFest & Geocercas</p>
                </div>
                <button onClick={() => setIsCreating(true)} className="bg-slate-900 text-white px-6 py-3 rounded-2xl flex items-center gap-2 hover:bg-slate-800 transition shadow-xl shadow-slate-200 font-black text-xs uppercase tracking-widest"><Plus size={18} /> Nuevo Salón</button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {loading ? (
                    <div className="col-span-full py-20 text-center text-slate-400 font-bold italic tracking-widest uppercase text-xs">Sincronizando Sedes...</div>
                ) : locations.length === 0 ? (
                    <div className="col-span-full py-20 text-center text-slate-400 font-bold italic">No hay salones registrados.</div>
                ) : locations.map(loc => (
                    <div key={loc.id} className="bg-white rounded-[32px] p-8 border border-slate-200 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                             <button onClick={() => setEditingLoc(loc)} className="p-3 bg-white text-slate-400 hover:text-orange-600 rounded-xl shadow-lg border border-slate-50 transition-transform hover:scale-110"><Pencil size={16}/></button>
                             <button onClick={() => handleDelete(loc.id)} className="p-3 bg-white text-slate-400 hover:text-red-600 rounded-xl shadow-lg border border-slate-50 transition-transform hover:scale-110"><Trash2 size={16}/></button>
                        </div>
                        <div className="p-5 bg-orange-50 text-orange-600 rounded-[24px] w-fit mb-6 shadow-inner"><MapPinned size={32} /></div>
                        <h3 className="font-black text-slate-900 text-2xl mb-2 tracking-tighter">{loc.name}</h3>
                        <p className="text-sm text-slate-400 mb-6 font-bold leading-relaxed">{loc.address}, {loc.city}</p>
                        <div className="flex flex-wrap items-center gap-2 text-[10px] font-black text-slate-300">
                            <span className="bg-slate-50 px-3 py-1.5 rounded-full tracking-tighter border border-slate-100">LAT: {loc.lat.toFixed(4)}</span>
                            <span className="bg-slate-50 px-3 py-1.5 rounded-full tracking-tighter border border-slate-100">LNG: {loc.lng.toFixed(4)}</span>
                            <span className="bg-orange-600 text-white px-3 py-1.5 rounded-full tracking-tighter border border-orange-700">R: {loc.radiusMeters}M</span>
                        </div>
                    </div>
                ))}
            </div>

            {(isCreating || editingLoc) && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-[40px] p-10 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-8">
                            <div>
                              <h3 className="font-black text-2xl text-slate-900 tracking-tighter">{isCreating ? 'AÑADIR SEDE' : 'EDITAR SEDE'}</h3>
                              <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Localización & Parámetros</p>
                            </div>
                            <button onClick={() => { setIsCreating(false); setEditingLoc(null); }} className="p-2 bg-slate-50 text-slate-400 hover:text-slate-600 rounded-full"><X/></button>
                        </div>
                        <LocationForm initialData={editingLoc} onSubmit={handleSave} onCancel={() => { setIsCreating(false); setEditingLoc(null); }} />
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Payroll Module ---

interface PayrollItem {
    id: string;
    userName: string;
    role: string;
    scheduledIn: string;
    realIn: string;
    scheduledOut: string;
    realOut: string;
    diffHours: string;
    aiDetail: string;
    isIncident: boolean;
}

const PayrollDashboard = () => {
    const [payrollItems, setPayrollItems] = useState<PayrollItem[]>([]);
    const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);

    const loadPayroll = async () => {
        setLoading(true);
        try {
            const [users, logs] = await Promise.all([
                fetchUsers(),
                fetchLogsByDateRange(new Date(startDate), new Date(endDate + 'T23:59:59'))
            ]);

            const items: PayrollItem[] = [];
            const logsByUser = logs.reduce((acc, log) => {
                if (!acc[log.userId]) acc[log.userId] = [];
                acc[log.userId].push(log);
                return acc;
            }, {} as Record<string, LogEntry[]>);

            for (const user of users) {
                const userLogs = (logsByUser[user.id] || []).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
                if (userLogs.length === 0) continue;

                const daysMap = userLogs.reduce((acc, log) => {
                    const day = log.timestamp.split('T')[0];
                    if (!acc[day]) acc[day] = { in: null, out: null };
                    if (log.type === 'CHECK_IN') acc[day].in = log;
                    else if (log.type === 'CHECK_OUT') acc[day].out = log;
                    return acc;
                }, {} as Record<string, { in: LogEntry | null, out: LogEntry | null }>);

                for (const date in daysMap) {
                    const session = daysMap[date];
                    const dayOfWeek = new Date(date).toLocaleDateString('es-ES', { weekday: 'long' });
                    const capitalizedDay = dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1);
                    const schedule = user.schedule.find(s => s.day === capitalizedDay) || { start: '--:--', end: '--:--' };

                    const realInTime = session.in ? new Date(session.in.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : 'S/F';
                    const realOutTime = session.out ? new Date(session.out.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : 'S/F';

                    let diffStr = "0.00";
                    if (session.in && session.out) {
                        const diffMs = new Date(session.out.timestamp).getTime() - new Date(session.in.timestamp).getTime();
                        diffStr = (diffMs / (1000 * 60 * 60)).toFixed(2);
                    }

                    const isLate = session.in && schedule.start !== '--:--' && realInTime > schedule.start;
                    const isEarly = session.out && schedule.end !== '--:--' && realOutTime < schedule.end;
                    const isMissing = !session.in || !session.out;

                    const item: PayrollItem = {
                        id: Math.random().toString(36).substr(2, 9),
                        userName: user.name,
                        role: user.role,
                        scheduledIn: schedule.start,
                        realIn: realInTime,
                        scheduledOut: schedule.end,
                        realOut: realOutTime,
                        diffHours: diffStr,
                        aiDetail: "Analizando incidencia...",
                        isIncident: isLate || isEarly || isMissing
                    };
                    items.push(item);
                }
            }

            setPayrollItems(items);
            items.forEach(async (item, idx) => {
                const detail = await generateIncidentExplanation(item.userName, item.scheduledIn, item.realIn, item.scheduledOut, item.realOut);
                setPayrollItems(prev => {
                    const updated = [...prev];
                    if(updated[idx]) updated[idx] = { ...updated[idx], aiDetail: detail };
                    return updated;
                });
            });
        } catch (e) { console.error(e); } finally { setLoading(false); }
    };

    useEffect(() => { loadPayroll(); }, []);

    const exportToPDF = () => {
        const doc = new jsPDF('l', 'mm', 'a4');
        doc.setFontSize(16);
        doc.text("Reporte de Liquidación e Incidencias - UpFest", 14, 15);
        autoTable(doc, {
            head: [['#', 'Persona', 'Rol', 'Hora Ingreso', 'H. Ingreso Real', 'Hora Egreso', 'H. Egreso Real', 'Hs', 'Detalle IA']],
            body: payrollItems.map((item, i) => [
                i + 1, item.userName, item.role, item.scheduledIn, item.realIn, item.scheduledOut, item.realOut, item.diffHours, item.aiDetail
            ]),
            startY: 25,
            theme: 'grid',
            styles: { fontSize: 7, cellPadding: 2 },
            headStyles: { fillColor: [30, 41, 59] }
        });
        doc.save(`Liquidacion_UpFest_${startDate}_al_${endDate}.pdf`);
    };

    return (
        <div className="p-6 max-w-[1600px] mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tighter">LIQUIDACIONES</h1>
                    <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Auditoría horaria asistida por IA</p>
                </div>
                <div className="flex gap-3">
                    <button onClick={exportToPDF} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-3 rounded-2xl hover:bg-slate-50 transition shadow-sm font-black text-[10px] uppercase tracking-widest">
                        <Download size={16} /> PDF
                    </button>
                    <button onClick={loadPayroll} className="flex items-center gap-2 bg-slate-900 text-white px-5 py-3 rounded-2xl hover:bg-slate-800 transition shadow-lg shadow-slate-200 font-black text-[10px] uppercase tracking-widest">
                        <RotateCcw size={16} /> Refrescar
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-[40px] shadow-sm border border-slate-200 p-10 mb-8 flex flex-col md:flex-row items-end gap-6">
                <div className="grid grid-cols-2 gap-6 flex-1">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha Inicio</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-8 focus:ring-orange-500/5 outline-none transition font-extrabold" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha Fin</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-8 focus:ring-orange-500/5 outline-none transition font-extrabold" />
                    </div>
                </div>
                <button onClick={loadPayroll} className="w-full md:w-auto bg-orange-600 text-white px-12 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-orange-700 transition shadow-xl shadow-orange-100">
                    <Search size={18} className="inline mr-2" /> Buscar
                </button>
            </div>

            <div className="bg-white rounded-[40px] shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-12">#</th>
                                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Persona</th>
                                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Rol</th>
                                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">H. Ingreso (P)</th>
                                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">H. Ingreso (R)</th>
                                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">H. Egreso (P)</th>
                                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">H. Egreso (R)</th>
                                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Total Hs</th>
                                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Observación IA</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr><td colSpan={9} className="p-24 text-center text-slate-400 italic font-black uppercase tracking-[0.2em] text-[10px]">Analizando incidencias con UpFest AI...</td></tr>
                            ) : payrollItems.length === 0 ? (
                                <tr><td colSpan={9} className="p-24 text-center text-slate-400 italic font-bold">No hay registros para este período.</td></tr>
                            ) : payrollItems.map((item, idx) => (
                                <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${item.isIncident ? 'bg-orange-50/20' : ''}`}>
                                    <td className="p-6 text-center font-mono text-xs text-slate-300">{idx + 1}</td>
                                    <td className="p-6 font-black text-slate-900 tracking-tight">{item.userName}</td>
                                    <td className="p-6"><span className="text-[10px] font-black bg-slate-100 text-slate-400 px-3 py-1.5 rounded-full border border-slate-200 uppercase tracking-tighter">{item.role}</span></td>
                                    <td className="p-6 text-center text-xs font-bold text-slate-300">{item.scheduledIn}</td>
                                    <td className={`p-6 text-center text-sm font-black ${item.realIn > item.scheduledIn && item.scheduledIn !== '--:--' ? 'text-red-500' : 'text-slate-700'}`}>{item.realIn}</td>
                                    <td className="p-6 text-center text-xs font-bold text-slate-300">{item.scheduledOut}</td>
                                    <td className={`p-6 text-center text-sm font-black ${item.realOut < item.scheduledOut && item.scheduledOut !== '--:--' ? 'text-red-500' : 'text-slate-700'}`}>{item.realOut}</td>
                                    <td className="p-6 text-center font-mono font-black text-slate-800 bg-slate-50/50">{item.diffHours}H</td>
                                    <td className="p-6 max-w-xs">
                                        <div className="flex items-start gap-2 italic text-xs text-slate-500 font-bold leading-relaxed">
                                            <Sparkles size={14} className="text-orange-500 mt-1 shrink-0" />
                                            {item.aiDetail}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// --- Sidebar ---

const Sidebar = ({ activeTab, setActiveTab, currentUser, onLogout, logoUrl }: { activeTab: string, setActiveTab: (t: string) => void, currentUser: User, onLogout: () => void, logoUrl: string | null }) => (
    <aside className="hidden md:flex flex-col w-72 bg-white border-r border-slate-200 h-screen sticky top-0 shadow-sm z-50">
        <div className="p-10 border-b border-slate-50 flex flex-col items-center">
            {logoUrl ? <img src={logoUrl} alt="Logo" className="h-16 w-auto object-contain mb-4" /> : <div className="w-16 h-16 bg-slate-900 text-white rounded-[24px] flex items-center justify-center font-black text-2xl mb-4 shadow-2xl">UP</div>}
            <span className="font-black text-slate-900 tracking-tighter text-2xl">UPFEST</span>
            <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Admin Control</span>
        </div>
        <nav className="flex-1 p-8 space-y-2">
            <button onClick={() => setActiveTab('clock')} className={`w-full flex items-center gap-4 px-6 py-4 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition ${activeTab === 'clock' ? 'bg-orange-50 text-orange-700 shadow-sm' : 'text-slate-400 hover:bg-slate-50'}`}><Clock size={20}/> Fichadas</button>
            {currentUser.role === Role.ADMIN && (
                <>
                    <button onClick={() => setActiveTab('payroll')} className={`w-full flex items-center gap-4 px-6 py-4 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition ${activeTab === 'payroll' ? 'bg-orange-50 text-orange-700 shadow-sm' : 'text-slate-400 hover:bg-slate-50'}`}><Wallet size={20}/> Liquidaciones</button>
                    <button onClick={() => setActiveTab('admin')} className={`w-full flex items-center gap-4 px-6 py-4 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition ${activeTab === 'admin' ? 'bg-orange-50 text-orange-700 shadow-sm' : 'text-slate-400 hover:bg-slate-50'}`}><Users size={20}/> Personal</button>
                    <button onClick={() => setActiveTab('locations')} className={`w-full flex items-center gap-4 px-6 py-4 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition ${activeTab === 'locations' ? 'bg-orange-50 text-orange-700 shadow-sm' : 'text-slate-400 hover:bg-slate-50'}`}><Building size={20}/> Salones</button>
                </>
            )}
        </nav>
        <div className="p-8 border-t border-slate-50">
            <button onClick={onLogout} className="w-full flex items-center gap-4 px-6 py-4 rounded-[20px] text-[10px] font-black uppercase tracking-widest text-red-400 hover:bg-red-50 transition"><LogOut size={20} /> Salir</button>
        </div>
    </aside>
);

// --- Main App ---

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('clock');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => { fetchCompanyLogo().then(setLogoUrl); }, []);

  if (!currentUser) return <LoginView onLogin={u => { setCurrentUser(u); setActiveTab(u.role === Role.ADMIN ? 'payroll' : 'clock'); }} logoUrl={logoUrl} />;

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} currentUser={currentUser} onLogout={() => setCurrentUser(null)} logoUrl={logoUrl} />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
          <main className="flex-1 overflow-y-auto custom-scrollbar">
            {activeTab === 'clock' && <div className="p-24 text-center"><div className="w-40 h-40 bg-slate-100 rounded-[48px] mx-auto mb-8 flex items-center justify-center text-slate-300 shadow-inner"><Clock size={56} /></div><h2 className="text-3xl font-black text-slate-900 tracking-tighter mb-2">MÓDULO DE CONTROL</h2><p className="text-slate-400 font-black text-[10px] uppercase tracking-[0.2em]">Sincronización biométrica activa</p></div>}
            {activeTab === 'payroll' && <PayrollDashboard />}
            {activeTab === 'admin' && <AdminDashboard />}
            {activeTab === 'locations' && <LocationsDashboard />}
          </main>
      </div>
    </div>
  );
}

// LoginView
const LoginView = ({ onLogin, logoUrl }: { onLogin: (u: User) => void, logoUrl: string | null }) => {
  const [dni, setDni] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
        const user = await authenticateUser(dni, password);
        if (user) onLogin(user);
        else setError('CREDENCIALES INVÁLIDAS');
    } catch (e) { setError('ERROR DE CONEXIÓN'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 font-sans">
      <div className="w-full max-w-sm bg-white rounded-[48px] shadow-2xl p-14 space-y-12 border border-slate-100 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-orange-600"></div>
        <div className="text-center">
          {logoUrl ? <img src={logoUrl} alt="Logo" className="h-20 w-auto mx-auto mb-8" /> : <div className="w-24 h-24 bg-slate-900 rounded-[32px] flex items-center justify-center mx-auto mb-8 text-white font-black text-4xl shadow-2xl">UP</div>}
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter mb-2 uppercase">ENTRAR</h2>
          <p className="text-slate-300 font-black text-[10px] uppercase tracking-[0.3em]">UpFest Cloud V4</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-6">
          <input type="text" value={dni} onChange={e => setDni(e.target.value)} className="w-full px-8 py-6 bg-slate-50 border border-slate-200 rounded-[24px] focus:ring-8 focus:ring-orange-500/5 outline-none transition font-extrabold placeholder:text-slate-300 text-lg shadow-inner" placeholder="USUARIO / DNI" required />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-8 py-6 bg-slate-50 border border-slate-200 rounded-[24px] focus:ring-8 focus:ring-orange-500/5 outline-none transition font-extrabold placeholder:text-slate-300 text-lg shadow-inner" placeholder="••••••••" required />
          {error && <div className="text-red-500 text-[10px] text-center font-black bg-red-50 p-5 rounded-[20px] border border-red-100 tracking-[0.2em]">{error}</div>}
          <button type="submit" disabled={loading} className={`w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-6 rounded-[24px] transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-2xl shadow-slate-200 uppercase tracking-widest text-xs ${loading ? 'opacity-50' : ''}`}>
            {loading ? 'CARGANDO...' : 'ACCEDER'}
          </button>
        </form>
      </div>
    </div>
  );
};
