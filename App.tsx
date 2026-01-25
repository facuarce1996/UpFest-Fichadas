
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Role, Location, User, LogEntry, WorkSchedule, Incident, ValidationResult, DEFAULT_ROLES, DAYS_OF_WEEK
} from './types';
import { 
  getCurrentPosition, calculateDistance, isWithinSchedule, 
  fetchUsers, fetchLocations, fetchLogs, fetchTodayLogs, fetchLogsByDateRange, addLog, saveUser, deleteUser,
  authenticateUser, saveLocation, deleteLocation, fetchCompanyLogo, saveCompanyLogo,
  fetchLastLog, updateLog, deleteLog, checkDatabaseHealth
} from './services/utils';
import { analyzeCheckIn } from './services/geminiService';
import { 
  Camera, User as UserIcon, Shield, Clock, 
  LogOut, CheckCircle, XCircle, AlertTriangle, Plus, Save, Lock, Hash, Upload, Trash2, ImageIcon, Pencil, X, RotateCcw, FileText, Users, Building, MapPin, Monitor, Maximize2, Laptop, FileUp, Key, Bell, BellRing, Wallet, MapPinned, RefreshCw, UserCheck, Shirt, Download, FileSpreadsheet, Menu, ArrowRight, Calendar, Briefcase, Filter, Search, XOctagon, Check, Navigation, Target, Activity, Eye, EyeOff, CalendarPlus, ChevronDown, TimerOff, Map
} from 'lucide-react';
import * as XLSX from 'xlsx';

// --- Helpers de Plataforma ---
const getAIStudio = () => (window as any).aistudio;
const isAIStudio = !!(getAIStudio() && getAIStudio().openSelectKey);

const handleOpenApiKeyDialog = async () => {
  const aiStudio = getAIStudio();
  if (aiStudio && aiStudio.openSelectKey) {
    try {
      await aiStudio.openSelectKey();
    } catch (e) {
      console.error("Error al abrir selector de llave:", e);
    }
  } else {
    alert("La llave de IA ha sido desactivada o ha expirado. Por favor, realiza un Redeploy en Vercel con una nueva API_KEY.");
  }
};

const formatMinutes = (mins: number) => {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
};

// --- Dashboard de RRHH / Nómina ---
const AdminDashboard = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const loadUsers = async () => {
    const data = await fetchUsers();
    setUsers(data);
  };

  useEffect(() => { loadUsers(); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setLoading(true);
    try {
      await saveUser(editingUser);
      setIsModalOpen(false);
      loadUsers();
    } catch (err: any) { alert(err.message); }
    finally { setLoading(true); loadUsers().then(() => setLoading(false)); }
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.legajo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 md:p-10 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black uppercase tracking-tighter flex items-center gap-4">
            <Users className="text-orange-600" size={32} /> Gestión de Personal
          </h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 italic">Nómina Activa UpFest</p>
        </div>
        <button 
          onClick={() => {
            setEditingUser({ 
              id: '', legajo: '', dni: '', password: '', name: '', role: 'Mozo', 
              dressCode: 'Camisa blanca, pantalón negro, zapatos negros.', 
              referenceImage: null, schedule: [], isActive: true 
            });
            setIsModalOpen(true);
          }}
          className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-3 hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
        >
          <Plus size={18}/> Nuevo Colaborador
        </button>
      </div>

      <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b bg-slate-50/50">
          <div className="relative max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Buscar por nombre o legajo..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-6 py-4 rounded-xl border-none bg-white text-xs font-bold outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-orange-500 transition-all"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                <th className="px-8 py-6">Ref</th>
                <th className="px-8 py-6">Colaborador</th>
                <th className="px-8 py-6">Rol</th>
                <th className="px-8 py-6">DNI</th>
                <th className="px-8 py-6">Estado</th>
                <th className="px-8 py-6 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredUsers.map(u => (
                <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-8 py-5">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden border">
                      {u.referenceImage ? <img src={u.referenceImage} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><UserIcon size={20}/></div>}
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className="block font-black text-slate-900 text-sm uppercase leading-none">{u.name}</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 block">Lgj: {u.legajo}</span>
                  </td>
                  <td className="px-8 py-5">
                    <span className="px-3 py-1 bg-slate-100 rounded-lg text-[9px] font-black uppercase text-slate-600 border border-slate-200">{u.role}</span>
                  </td>
                  <td className="px-8 py-5 font-mono text-xs text-slate-500">{u.dni}</td>
                  <td className="px-8 py-5">
                    <span className={`w-3 h-3 rounded-full inline-block ${u.isActive ? 'bg-emerald-500 shadow-lg shadow-emerald-100' : 'bg-slate-300'}`}></span>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => { setEditingUser(u); setIsModalOpen(true); }} className="p-3 bg-slate-50 text-slate-400 hover:text-slate-900 rounded-xl transition-all"><Pencil size={18}/></button>
                      <button onClick={async () => { if(confirm('¿Borrar colaborador?')) { await deleteUser(u.id); loadUsers(); } }} className="p-3 bg-slate-50 text-slate-400 hover:text-red-500 rounded-xl transition-all"><Trash2 size={18}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && editingUser && (
        <div className="fixed inset-0 z-[200] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[40px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b flex items-center justify-between">
              <h3 className="text-xl font-black uppercase tracking-tighter">{editingUser.id ? 'Editar Colaborador' : 'Nuevo Colaborador'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all"><X/></button>
            </div>
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="flex items-center gap-6">
                    <div className="relative group">
                      <div className="w-24 h-24 rounded-[32px] bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden">
                        {editingUser.referenceImage ? <img src={editingUser.referenceImage} className="w-full h-full object-cover" /> : <ImageIcon className="text-slate-200" size={32}/>}
                      </div>
                      <label className="absolute inset-0 flex items-center justify-center bg-slate-900/0 group-hover:bg-slate-900/60 transition-all cursor-pointer rounded-[32px]">
                        <Camera className="text-white opacity-0 group-hover:opacity-100" size={20}/>
                        <input type="file" className="hidden" accept="image/*" onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => setEditingUser({ ...editingUser, referenceImage: reader.result as string });
                            reader.readAsDataURL(file);
                          }
                        }} />
                      </label>
                    </div>
                    <div className="flex-1 space-y-2">
                       <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-tight">Foto Biométrica</p>
                       <p className="text-[9px] text-slate-400 leading-tight italic">Esta imagen se usará para validar la identidad mediante IA.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Nombre Completo</label>
                      <input required value={editingUser.name} onChange={e => setEditingUser({...editingUser, name: e.target.value})} className="w-full px-5 py-3 rounded-xl bg-slate-50 text-xs font-bold outline-none focus:ring-2 focus:ring-orange-500 transition-all" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Legajo</label>
                      <input required value={editingUser.legajo} onChange={e => setEditingUser({...editingUser, legajo: e.target.value})} className="w-full px-5 py-3 rounded-xl bg-slate-50 text-xs font-bold outline-none focus:ring-2 focus:ring-orange-500 transition-all" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-500 ml-2">DNI</label>
                      <input required value={editingUser.dni} onChange={e => setEditingUser({...editingUser, dni: e.target.value})} className="w-full px-5 py-3 rounded-xl bg-slate-50 text-xs font-bold outline-none focus:ring-2 focus:ring-orange-500 transition-all" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Clave Acceso</label>
                      <input required type="password" value={editingUser.password} onChange={e => setEditingUser({...editingUser, password: e.target.value})} className="w-full px-5 py-3 rounded-xl bg-slate-50 text-xs font-bold outline-none focus:ring-2 focus:ring-orange-500 transition-all" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Rol / Función</label>
                    <select value={editingUser.role} onChange={e => setEditingUser({...editingUser, role: e.target.value})} className="w-full px-5 py-3 rounded-xl bg-slate-50 text-xs font-bold outline-none focus:ring-2 focus:ring-orange-500 transition-all">
                      {DEFAULT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Código de Vestimenta (Validado por IA)</label>
                    <textarea rows={3} value={editingUser.dressCode} onChange={e => setEditingUser({...editingUser, dressCode: e.target.value})} className="w-full px-5 py-3 rounded-xl bg-slate-50 text-xs font-bold outline-none focus:ring-2 focus:ring-orange-500 transition-all resize-none" />
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Disponibilidad / Horarios</label>
                      <button type="button" onClick={() => setEditingUser({...editingUser, schedule: [...editingUser.schedule, { startDay: 'Lunes', startTime: '09:00', endDay: 'Lunes', endTime: '18:00' }]})} className="text-[9px] font-black text-orange-600 uppercase flex items-center gap-1"><Plus size={14}/> Agregar</button>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                      {editingUser.schedule.map((s, idx) => (
                        <div key={idx} className="bg-slate-50 p-3 rounded-xl flex items-center gap-2 group">
                          <select value={s.startDay} onChange={e => {
                            const newSch = [...editingUser.schedule];
                            newSch[idx].startDay = e.target.value;
                            setEditingUser({...editingUser, schedule: newSch});
                          }} className="bg-transparent text-[10px] font-bold outline-none">
                            {DAYS_OF_WEEK.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                          <input type="time" value={s.startTime} onChange={e => {
                            const newSch = [...editingUser.schedule];
                            newSch[idx].startTime = e.target.value;
                            setEditingUser({...editingUser, schedule: newSch});
                          }} className="bg-transparent text-[10px] font-bold outline-none" />
                          <span className="text-[10px] text-slate-300">a</span>
                          <input type="time" value={s.endTime} onChange={e => {
                            const newSch = [...editingUser.schedule];
                            newSch[idx].endTime = e.target.value;
                            setEditingUser({...editingUser, schedule: newSch});
                          }} className="bg-transparent text-[10px] font-bold outline-none" />
                          <button type="button" onClick={() => {
                            const newSch = editingUser.schedule.filter((_, i) => i !== idx);
                            setEditingUser({...editingUser, schedule: newSch});
                          }} className="ml-auto text-slate-300 hover:text-rose-500"><X size={14}/></button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl">
                    <input type="checkbox" id="user-active" checked={editingUser.isActive} onChange={e => setEditingUser({...editingUser, isActive: e.target.checked})} className="w-5 h-5 rounded-lg border-slate-200 text-orange-600 focus:ring-orange-500" />
                    <label htmlFor="user-active" className="text-[10px] font-black uppercase text-slate-700">Colaborador Activo</label>
                  </div>
                </div>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-slate-900 text-white font-black uppercase text-xs py-5 rounded-[24px] shadow-2xl hover:bg-slate-800 transition-all flex items-center justify-center gap-3">
                {loading ? <RefreshCw className="animate-spin"/> : <Save size={18}/>}
                Guardar Colaborador
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Dashboard de Salones / Sedes ---
const LocationsDashboard = () => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [editingLoc, setEditingLoc] = useState<Location | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadLocations = async () => setLocations(await fetchLocations());
  useEffect(() => { loadLocations(); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLoc) return;
    setLoading(true);
    try {
      await saveLocation(editingLoc);
      setIsModalOpen(false);
      loadLocations();
    } catch (err: any) { alert(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="p-4 md:p-10 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black uppercase tracking-tighter flex items-center gap-4">
            <Building className="text-orange-600" size={32} /> Salones y Sedes
          </h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 italic">Puntos de Validación UpFest</p>
        </div>
        <button onClick={() => { setEditingLoc({ id: '', name: '', address: '', city: 'Buenos Aires', lat: -34.6037, lng: -58.3816, radiusMeters: 100 }); setIsModalOpen(true); }} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-3 hover:bg-slate-800 transition-all shadow-xl shadow-slate-200">
          <Plus size={18}/> Nueva Sede
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {locations.map(loc => (
          <div key={loc.id} className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-xl hover:border-orange-100 transition-all group relative overflow-hidden">
             <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-full -mr-16 -mt-16 group-hover:bg-orange-50 transition-colors"></div>
             <MapPin className="text-slate-200 group-hover:text-orange-200 transition-colors mb-4" size={40} />
             <h3 className="text-lg font-black uppercase text-slate-900 tracking-tight">{loc.name}</h3>
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 mb-6">{loc.address}, {loc.city}</p>
             <div className="space-y-4">
               <div className="flex items-center justify-between text-[10px] font-black uppercase text-slate-500">
                 <span>Radio de Acción</span>
                 <span className="text-orange-600 bg-orange-50 px-3 py-1 rounded-lg">{loc.radiusMeters}m</span>
               </div>
               <div className="flex items-center justify-between text-[10px] font-black uppercase text-slate-500">
                 <span>Coordenadas</span>
                 <span className="font-mono text-[9px]">{loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</span>
               </div>
             </div>
             <div className="flex items-center gap-2 mt-8">
               <button onClick={() => { setEditingLoc(loc); setIsModalOpen(true); }} className="flex-1 bg-slate-50 py-3 rounded-xl font-black text-[10px] uppercase text-slate-400 hover:bg-slate-900 hover:text-white transition-all">Editar</button>
               <button onClick={async () => { if(confirm('¿Borrar sede?')) { await deleteLocation(loc.id); loadLocations(); } }} className="p-3 bg-slate-50 rounded-xl text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"><Trash2 size={18}/></button>
             </div>
          </div>
        ))}
      </div>

      {isModalOpen && editingLoc && (
        <div className="fixed inset-0 z-[200] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-[40px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b flex items-center justify-between">
              <h3 className="text-xl font-black uppercase tracking-tighter">{editingLoc.id ? 'Editar Sede' : 'Nueva Sede'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all"><X/></button>
            </div>
            <form onSubmit={handleSave} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Nombre del Salón</label>
                <input required value={editingLoc.name} onChange={e => setEditingLoc({...editingLoc, name: e.target.value})} className="w-full px-5 py-3 rounded-xl bg-slate-50 text-xs font-bold outline-none focus:ring-2 focus:ring-orange-500 transition-all" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Dirección</label>
                  <input required value={editingLoc.address} onChange={e => setEditingLoc({...editingLoc, address: e.target.value})} className="w-full px-5 py-3 rounded-xl bg-slate-50 text-xs font-bold outline-none focus:ring-2 focus:ring-orange-500 transition-all" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Ciudad</label>
                  <input required value={editingLoc.city} onChange={e => setEditingLoc({...editingLoc, city: e.target.value})} className="w-full px-5 py-3 rounded-xl bg-slate-50 text-xs font-bold outline-none focus:ring-2 focus:ring-orange-500 transition-all" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Latitud</label>
                  <input required type="number" step="any" value={editingLoc.lat} onChange={e => setEditingLoc({...editingLoc, lat: parseFloat(e.target.value)})} className="w-full px-5 py-3 rounded-xl bg-slate-50 text-xs font-bold outline-none focus:ring-2 focus:ring-orange-500 transition-all" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Longitud</label>
                  <input required type="number" step="any" value={editingLoc.lng} onChange={e => setEditingLoc({...editingLoc, lng: parseFloat(e.target.value)})} className="w-full px-5 py-3 rounded-xl bg-slate-50 text-xs font-bold outline-none focus:ring-2 focus:ring-orange-500 transition-all" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Radio de Tolerancia (Metros)</label>
                <input required type="number" value={editingLoc.radiusMeters} onChange={e => setEditingLoc({...editingLoc, radiusMeters: parseInt(e.target.value)})} className="w-full px-5 py-3 rounded-xl bg-slate-50 text-xs font-bold outline-none focus:ring-2 focus:ring-orange-500 transition-all" />
              </div>
              <button type="submit" disabled={loading} className="w-full bg-slate-900 text-white font-black uppercase text-xs py-5 rounded-[24px] shadow-2xl hover:bg-slate-800 transition-all flex items-center justify-center gap-3">
                {loading ? <RefreshCw className="animate-spin"/> : <Save size={18}/>}
                Guardar Sede
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Clock View (User & Monitor) ---
const ClockView = ({ user, onLogout }: { user: User, onLogout: () => void }) => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [deviceLocation, setDeviceLocation] = useState<Location | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [adminLogs, setAdminLogs] = useState<LogEntry[]>([]);
  const [userTodayLogs, setUserTodayLogs] = useState<LogEntry[]>([]);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showNoExitsModal, setShowNoExitsModal] = useState(false);
  
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [isFiltering, setIsFiltering] = useState(false);
  const [activeQuickFilter, setActiveQuickFilter] = useState<string | null>(null);
  
  // Estado para Fichada Manual
  const [showManualLogModal, setShowManualLogModal] = useState(false);
  const [manualUserSearch, setManualUserSearch] = useState('');
  const [isUserListOpen, setIsUserListOpen] = useState(false);
  const [manualLogData, setManualLogData] = useState({
    userId: '',
    type: 'BOTH' as 'CHECK_IN' | 'CHECK_OUT' | 'BOTH',
    date: new Date().toISOString().split('T')[0],
    checkInTime: '09:00',
    checkOutTime: '18:00',
    locationId: ''
  });
  const [isSavingManual, setIsSavingManual] = useState(false);
  
  const [successAction, setSuccessAction] = useState<{ type: string, countdown: number } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!successAction) return;
    const timer = setInterval(() => {
      setSuccessAction(prev => {
        if (!prev) return null;
        if (prev.countdown <= 1) {
          clearInterval(timer);
          setTimeout(() => onLogout(), 100); 
          return null; 
        }
        return { ...prev, countdown: prev.countdown - 1 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [successAction, onLogout]);

  const loadData = useCallback(async (showLoading = false, start?: string, end?: string) => {
    if (showLoading) setIsFiltering(true);
    const sDate = start !== undefined ? start : filterStartDate;
    const eDate = end !== undefined ? end : filterEndDate;
    const deviceLocId = localStorage.getItem('upfest_terminal_location_id');

    try {
      const logsPromise = (sDate && eDate) 
        ? fetchLogsByDateRange(new Date(sDate + 'T00:00:00'), new Date(eDate + 'T23:59:59'))
        : fetchLogs();

      const [allLocs, logs, users] = await Promise.all([
        fetchLocations(),
        logsPromise,
        fetchUsers()
      ]);

      setLocations(allLocs);
      setAllUsers(users);
      if (user.role === 'Admin') setAdminLogs(logs);
      setUserTodayLogs(logs.filter(l => l.userId === user.id && new Date(l.timestamp).toDateString() === new Date().toDateString()));
      if (deviceLocId) setDeviceLocation(allLocs.find(l => l.id === deviceLocId) || null);
    } catch (err) {
      console.error("Error al cargar datos del monitor:", err);
    } finally {
      if (showLoading) setIsFiltering(false);
    }
  }, [user.id, user.role, filterStartDate, filterEndDate]);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => { if (!filterStartDate && !filterEndDate) loadData(); }, 30000);
    return () => clearInterval(interval);
  }, [loadData, filterStartDate, filterEndDate]);

  const handleExportExcel = () => {
    if (adminLogs.length === 0) return alert("No hay datos para exportar.");
    const reportData = adminLogs.map(l => ({
      'Legajo': l.legajo,
      'Nombre': l.userName,
      'Fecha': new Date(l.timestamp).toLocaleDateString('es-AR'),
      'Hora': new Date(l.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      'Tipo': l.type === 'CHECK_IN' ? 'INGRESO' : 'EGRESO',
      'Sede': l.locationName,
      'Validación': l.identityStatus === 'MATCH' && l.dressCodeStatus === 'PASS' ? 'OK' : 'OBSERVADO',
      'Comentario IA': l.aiFeedback
    }));
    const ws = XLSX.utils.json_to_sheet(reportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Asistencia");
    XLSX.writeFile(wb, `Reporte_UpFest_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  useEffect(() => {
    let active = true;
    async function startCamera() {
      if (cameraActive) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } } });
          if (active && videoRef.current) { streamRef.current = stream; videoRef.current.srcObject = stream; }
        } catch (err) { if (active) setCameraActive(false); }
      } else { stopCamera(); }
    }
    startCamera();
    return () => { active = false; stopCamera(); };
  }, [cameraActive]);

  const stopCamera = () => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const handleClockAction = async () => {
    if (!photo) return;
    setLoading(true);
    setLoadingMsg('Validando ubicación...');
    try {
      let locStatus: 'VALID' | 'INVALID' | 'SKIPPED' = 'SKIPPED';
      try {
        const pos = await getCurrentPosition();
        if (deviceLocation) {
          const dist = calculateDistance(pos.coords.latitude, pos.coords.longitude, deviceLocation.lat, deviceLocation.lng);
          locStatus = dist <= deviceLocation.radiusMeters ? 'VALID' : 'INVALID';
        }
      } catch (e) { console.warn("Geo error", e); }
      setLoadingMsg('IA: Analizando Identidad...');
      
      let iaResult: ValidationResult;
      try {
        iaResult = await analyzeCheckIn(photo, user.dressCode, user.referenceImage);
      } catch (err: any) {
        if (err.message === "API_KEY_INVALID_OR_LEAKED") {
            setLoadingMsg("LLAVE DESACTIVADA. SOLICITANDO NUEVA...");
            await handleOpenApiKeyDialog();
            iaResult = await analyzeCheckIn(photo, user.dressCode, user.referenceImage);
        } else { throw err; }
      }

      const lastLog = await fetchLastLog(user.id);
      let type: 'CHECK_IN' | 'CHECK_OUT' = (lastLog && lastLog.type === 'CHECK_IN' && (new Date().getTime() - new Date(lastLog.timestamp).getTime()) < 20 * 3600000) ? 'CHECK_OUT' : 'CHECK_IN';

      const newLog: LogEntry = {
        id: '', userId: user.id, userName: user.name, legajo: user.legajo, timestamp: new Date().toISOString(), type,
        locationId: deviceLocation?.id || 'manual', locationName: deviceLocation?.name || 'Manual', locationStatus: locStatus,
        dressCodeStatus: iaResult.dressCodeMatches ? 'PASS' : 'FAIL', identityStatus: iaResult.identityMatch ? 'MATCH' : 'NO_MATCH',
        photoEvidence: photo, aiFeedback: iaResult.description, scheduleStatus: isWithinSchedule(user.schedule) ? 'ON_TIME' : 'OFF_SCHEDULE'
      };
      await addLog(newLog);
      setPhoto(null);
      loadData();
      setSuccessAction({ type: type === 'CHECK_IN' ? 'INGRESO' : 'EGRESO', countdown: 7 });
    } catch (error: any) { 
      if (error.message === "API_KEY_INVALID_OR_LEAKED") handleOpenApiKeyDialog();
      else alert("Error en validación: " + (error.message || "Error desconocido"));
    } finally { setLoading(false); setLoadingMsg(''); }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.8);
        setPhoto(dataUrl); setCameraActive(false);
      }
    }
  };

  if (user.role === 'Admin') {
    const incidentLogs = adminLogs.filter(l => l.dressCodeStatus === 'FAIL' || l.identityStatus === 'NO_MATCH');
    const noExitLogs = adminLogs.filter(log => {
      if (log.type !== 'CHECK_IN') return false;
      const userLogs = adminLogs.filter(l => l.userId === log.userId).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const idx = userLogs.findIndex(l => l.id === log.id);
      const nextLog = userLogs[idx + 1];
      const isOld = (new Date().getTime() - new Date(log.timestamp).getTime()) > 20 * 3600000;
      return (nextLog && nextLog.type === 'CHECK_IN') || (!nextLog && isOld);
    });

    return (
      <div className="max-w-full mx-auto p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
        <div className="bg-white rounded-[32px] p-6 md:p-10 border border-slate-200 shadow-sm">
           <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-6">
              <div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase flex items-center gap-3">
                  <Monitor className="text-orange-600" /> MONITOR DE ASISTENCIA
                </h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Control Biométrico en Tiempo Real</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={handleExportExcel} className="px-6 py-4 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center gap-3 transition-all hover:bg-emerald-100 shadow-sm">
                    <Download size={18}/><span className="text-[10px] font-black uppercase tracking-widest">Exportar Excel</span>
                </button>
                <button onClick={() => setShowAlerts(true)} className={`px-6 py-4 rounded-full border flex items-center gap-3 transition-all ${incidentLogs.length > 0 ? 'bg-red-50 border-red-200 text-red-600 shadow-lg animate-pulse' : 'bg-slate-50 text-slate-400'}`}>
                    <Bell size={18}/><span className="text-[10px] font-black uppercase tracking-widest">Alertas ({incidentLogs.length})</span>
                </button>
                <button onClick={() => setShowNoExitsModal(true)} className={`px-6 py-4 rounded-full border flex items-center gap-3 transition-all ${noExitLogs.length > 0 ? 'bg-orange-50 border-orange-200 text-orange-600 shadow-lg' : 'bg-slate-50 text-slate-400'}`}>
                    <TimerOff size={18}/><span className="text-[10px] font-black uppercase tracking-widest">Sin Egreso ({noExitLogs.length})</span>
                </button>
              </div>
           </div>

           <div className="overflow-x-auto bg-slate-50/50 rounded-[32px] border border-slate-100">
              <table className="w-full text-left min-w-[1000px]">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="px-8 py-6 text-[10px] font-black uppercase text-center w-24">Foto</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase">Colaborador</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase text-center">Hora</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase text-center">Evento</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase text-center border-l border-white/10">Validación</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {adminLogs.map(log => (
                    <tr key={log.id} className="hover:bg-white transition-all">
                      <td className="px-8 py-4 text-center">
                         <div className="w-14 h-14 mx-auto rounded-xl overflow-hidden border-2 border-white shadow-sm cursor-zoom-in" onClick={() => log.photoEvidence && setZoomedImage(log.photoEvidence)}>
                            {log.photoEvidence ? <img src={log.photoEvidence} className="w-full h-full object-cover" /> : <div className="bg-slate-100 w-full h-full flex items-center justify-center text-slate-300"><UserIcon size={20}/></div>}
                         </div>
                      </td>
                      <td className="px-8 py-4">
                        <span className="block font-black text-slate-900 text-sm uppercase leading-none">{log.userName}</span>
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Lgj: {log.legajo} | {log.locationName}</span>
                      </td>
                      <td className="px-8 py-4 text-center">
                          <span className="text-xs font-black text-slate-900 font-mono bg-white px-3 py-1 rounded-lg border">{new Date(log.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      <td className="px-8 py-4 text-center">
                        <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase border-2 ${log.type === 'CHECK_IN' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                          {log.type === 'CHECK_IN' ? 'INGRESO' : 'EGRESO'}
                        </span>
                      </td>
                      <td className="px-8 py-4 text-center border-l border-slate-100">
                        <div className="flex items-center justify-center gap-2">
                           <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase ${log.identityStatus === 'MATCH' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>Biometría</span>
                           <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase ${log.dressCodeStatus === 'PASS' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>Dress</span>
                        </div>
                      </td>
                      <td className="px-8 py-4 text-center">
                        <button onClick={async () => { if(confirm('¿Eliminar fichada?')) { await deleteLog(log.id); loadData(); } }} className="p-3 text-slate-300 hover:text-red-500 transition-all"><Trash2 size={20}/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
           </div>
        </div>

        {/* Modal Alertas Monitor */}
        {showAlerts && (
          <div className="fixed inset-0 z-[250] bg-slate-900/95 backdrop-blur-xl flex items-center justify-center p-6" onClick={() => setShowAlerts(false)}>
            <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[64px] shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="p-10 border-b flex items-center justify-between">
                   <h2 className="text-3xl font-black uppercase tracking-tighter flex items-center gap-6"><Bell className="text-rose-600 animate-ring" size={36}/> Centro de Alertas</h2>
                   <button onClick={() => setShowAlerts(false)} className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center"><X/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-10 space-y-6 bg-slate-50/50">
                   {incidentLogs.length === 0 ? <p className="text-center py-20 font-black text-slate-300 uppercase italic tracking-widest">Sin incidencias biométricas</p> : incidentLogs.map(log => (
                     <div key={log.id} className="bg-white border-2 border-slate-100 rounded-[40px] p-8 flex items-center gap-10 shadow-sm">
                        <img src={log.photoEvidence} className="w-32 h-32 rounded-[32px] object-cover shadow-xl border-4 border-slate-50" />
                        <div className="flex-1 space-y-2">
                           <span className="font-black text-2xl text-slate-900 uppercase tracking-tighter leading-none">{log.userName}</span>
                           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{new Date(log.timestamp).toLocaleString('es-AR')}</p>
                           <p className="text-xs text-slate-500 italic mt-4">"{log.aiFeedback}"</p>
                        </div>
                     </div>
                   ))}
                </div>
            </div>
          </div>
        )}

        {/* Modal Sin Egreso */}
        {showNoExitsModal && (
          <div className="fixed inset-0 z-[250] bg-slate-900/95 backdrop-blur-xl flex items-center justify-center p-6" onClick={() => setShowNoExitsModal(false)}>
            <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[64px] shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="p-10 border-b flex items-center justify-between">
                   <h2 className="text-3xl font-black uppercase tracking-tighter flex items-center gap-6"><TimerOff className="text-orange-600" size={36}/> Turnos Abiertos (+20hs)</h2>
                   <button onClick={() => setShowNoExitsModal(false)} className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center"><X/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-10 space-y-6 bg-slate-50/50">
                   {noExitLogs.length === 0 ? <p className="text-center py-20 font-black text-slate-300 uppercase italic tracking-widest">Todos los turnos están cerrados</p> : noExitLogs.map(log => (
                     <div key={log.id} className="bg-white border-2 border-slate-100 rounded-[40px] p-8 flex items-center gap-10 shadow-sm border-l-8 border-l-orange-500">
                        <div className="w-20 h-20 bg-orange-50 rounded-[24px] flex items-center justify-center text-orange-600 font-black text-xl">IN</div>
                        <div className="flex-1 space-y-2">
                           <span className="font-black text-2xl text-slate-900 uppercase tracking-tighter leading-none">{log.userName}</span>
                           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ingresó el: {new Date(log.timestamp).toLocaleString('es-AR')}</p>
                           <p className="text-xs text-slate-500 mt-4 font-bold uppercase text-orange-600">Este colaborador no registró egreso dentro del margen de 20hs.</p>
                        </div>
                     </div>
                   ))}
                </div>
            </div>
          </div>
        )}

        {zoomedImage && (<div className="fixed inset-0 z-[300] bg-slate-900/98 flex items-center justify-center p-4" onClick={() => setZoomedImage(null)}><img src={zoomedImage} className="max-w-full max-h-full rounded-[40px] shadow-2xl border-8 border-white animate-in zoom-in-95 duration-300" /></div>)}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white rounded-[48px] p-10 border shadow-2xl flex flex-col md:flex-row gap-10">
          <div className="flex-1 space-y-8">
              <h2 className="text-3xl font-black uppercase tracking-tighter flex items-center gap-4">
                 <Camera className="text-orange-600" size={32} /> Registro Biométrico
              </h2>
              <div className="aspect-square rounded-[40px] overflow-hidden bg-slate-900 relative border-4 border-slate-50 shadow-inner">
                 {!cameraActive && !photo && (
                   <button onClick={() => setCameraActive(true)} className="absolute inset-0 text-white font-black uppercase text-xs flex flex-col items-center justify-center gap-6 group">
                     <div className="w-20 h-20 rounded-full bg-orange-600 flex items-center justify-center shadow-2xl ring-8 ring-orange-50 group-hover:scale-110 transition-transform duration-300"><Camera size={32}/></div>
                     Encender Cámara
                   </button>
                 )}
                 {cameraActive && <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover scale-x-[-1]" />}
                 {photo && <img src={photo} className="w-full h-full object-cover" />}
                 {loading && (
                   <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md flex flex-col items-center justify-center text-white p-10 text-center z-10">
                     <RefreshCw className="animate-spin mb-6" size={40} />
                     <p className="font-black text-xs uppercase tracking-[0.2em]">{loadingMsg || 'Procesando...'}</p>
                   </div>
                 )}
              </div>
              <div className="space-y-4">
                {cameraActive && <button onClick={capturePhoto} className="w-full py-6 bg-orange-600 text-white rounded-[28px] font-black uppercase tracking-widest text-xs shadow-2xl active:scale-95 transition-all">Capturar Foto</button>}
                {photo && !loading && <button onClick={handleClockAction} className="w-full py-6 bg-slate-900 text-white rounded-[28px] font-black uppercase tracking-widest text-xs shadow-2xl flex items-center justify-center gap-4">Confirmar Fichada <ArrowRight size={20}/></button>}
                {photo && !loading && <button onClick={() => { setPhoto(null); setCameraActive(true); }} className="w-full py-4 bg-slate-100 text-slate-500 rounded-[24px] font-black uppercase text-[10px] tracking-widest">Repetir captura</button>}
              </div>
          </div>
          <div className="w-full md:w-72 space-y-8">
              <div className="bg-slate-50 p-8 rounded-[40px] border border-slate-100">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Sesión Activa</h4>
                  <div className="flex flex-col items-center text-center space-y-4">
                      <div className="w-20 h-20 rounded-[28px] bg-white border-2 border-slate-100 overflow-hidden shadow-sm">
                          {user.referenceImage && <img src={user.referenceImage} className="w-full h-full object-cover" />}
                      </div>
                      <span className="font-black text-sm uppercase text-slate-900 leading-tight">{user.name}</span>
                      <span className="px-3 py-1 bg-slate-200 rounded-lg text-[9px] font-black uppercase text-slate-500">{user.role}</span>
                  </div>
              </div>
              <div className="bg-white p-8 rounded-[40px] border border-slate-100 flex-1">
                 <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8">Historial Hoy</h4>
                 <div className="space-y-4 max-h-72 overflow-y-auto pr-2">
                    {userTodayLogs.length === 0 ? <p className="text-center py-10 text-[9px] font-black text-slate-300 uppercase italic">Sin movimientos registrados</p> : userTodayLogs.map(l => (
                       <div key={l.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 shadow-sm">
                          <div className="flex items-center gap-3">
                             {l.type === 'CHECK_IN' ? <CheckCircle className="text-emerald-500" size={16}/> : <LogOut className="text-slate-400" size={16}/>}
                             <span className={`text-[9px] font-black uppercase ${l.type === 'CHECK_IN' ? 'text-emerald-600' : 'text-slate-500'}`}>{l.type === 'CHECK_IN' ? 'Entrada' : 'Salida'}</span>
                          </div>
                          <span className="font-mono text-xs font-black text-slate-900">{new Date(l.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                       </div>
                    ))}
                 </div>
              </div>
          </div>
       </div>
       <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

// --- App Principal ---
export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('clock');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => { fetchCompanyLogo().then(setLogoUrl).catch(() => {}); }, []);

  if (!currentUser) return <LoginView onLogin={(u: User) => { setCurrentUser(u); setActiveTab('clock'); }} logoUrl={logoUrl} />;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row overflow-hidden text-slate-900 font-inter">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        currentUser={currentUser} 
        onLogout={() => setCurrentUser(null)} 
        logoUrl={logoUrl} 
        isMobileMenuOpen={isMobileMenuOpen} 
        setIsMobileMenuOpen={setIsMobileMenuOpen} 
      />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="md:hidden bg-white/90 backdrop-blur-md border-b px-8 py-6 flex items-center justify-between z-50 sticky top-0 shadow-sm">
          <button onClick={() => setIsMobileMenuOpen(true)} className="p-3 -ml-3 text-slate-900"><Menu size={28}/></button>
          <span className="font-black text-2xl tracking-tighter text-slate-900">UPFEST</span>
          <div className="w-10"></div> 
        </header>
        <main className="flex-1 overflow-y-auto scroll-smooth">
          <div className="pb-24 md:pb-0">
            {activeTab === 'clock' && <ClockView user={currentUser} onLogout={() => setCurrentUser(null)} />}
            {activeTab === 'admin' && <AdminDashboard />}
            {activeTab === 'locations' && <LocationsDashboard />}
          </div>
        </main>
      </div>
    </div>
  );
}

const Sidebar = ({ activeTab, setActiveTab, currentUser, onLogout, logoUrl, isMobileMenuOpen, setIsMobileMenuOpen }: any) => {
  const NavButton = ({ tab, icon: Icon, label }: any) => (
    <button 
      onClick={() => { setActiveTab(tab); setIsMobileMenuOpen(false); }} 
      className={`w-full flex items-center gap-6 px-8 py-5 rounded-[28px] text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 ${activeTab === tab ? 'bg-orange-600 text-white shadow-xl shadow-orange-100' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-900'}`}
    >
      <Icon size={22}/> {label}
    </button>
  );

  return (
    <>
      {isMobileMenuOpen && <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[90] md:hidden animate-in fade-in" onClick={() => setIsMobileMenuOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-[100] w-80 bg-white border-r border-slate-100 transform transition-transform duration-500 ease-out md:translate-x-0 md:static h-full flex flex-col shadow-2xl md:shadow-none ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-12 border-b flex flex-col items-center bg-white">
          {logoUrl ? <img src={logoUrl} className="h-16 mb-6 object-contain" /> : <div className="w-16 h-16 bg-slate-900 text-white rounded-[24px] flex items-center justify-center font-black text-3xl mb-6 shadow-2xl">UP</div>}
          <span className="font-black text-slate-900 tracking-tighter text-3xl">UPFEST</span>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-2">Security Suite v4.0</p>
        </div>
        <nav className="flex-1 p-8 space-y-4 overflow-y-auto scrollbar-hide">
          <NavButton tab="clock" icon={Clock} label={currentUser.role === 'Admin' ? 'Monitor' : 'Fichada'} />
          {currentUser.role === 'Admin' && (
            <>
              <NavButton tab="admin" icon={Users} label="RRHH / Nómina" />
              <NavButton tab="locations" icon={Building} label="Salones / Sedes" />
            </>
          )}
        </nav>
        <div className="p-10 border-t space-y-4">
          {currentUser.role === 'Admin' && isAIStudio && (
            <button onClick={handleOpenApiKeyDialog} className="w-full flex items-center gap-6 px-8 py-4 rounded-[24px] text-[9px] font-black uppercase text-orange-600 border-2 border-dashed border-orange-200 hover:bg-orange-50 transition-colors">
              <Key size={20} /> Llave AI
            </button>
          )}
          <button onClick={onLogout} className="w-full flex items-center gap-6 px-8 py-5 rounded-[28px] text-[10px] font-black uppercase tracking-[0.2em] text-rose-400 hover:bg-rose-50 hover:text-rose-600 transition-all">
            <LogOut size={22} /> Salir
          </button>
        </div>
      </aside>
    </>
  );
};

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
      else setError('DNI O CLAVE INCORRECTO'); 
    } catch (err: any) { setError(err.message || 'ERROR DE CONEXIÓN'); } 
    finally { setLoading(false); } 
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50/50 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-orange-100/30 rounded-full -mr-32 -mt-32 blur-3xl"></div>
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-slate-200/30 rounded-full -ml-32 -mb-32 blur-3xl"></div>
      <div className="w-full max-w-sm bg-white rounded-[64px] shadow-2xl p-16 border border-white relative z-10 text-center animate-in zoom-in-95 duration-700">
        <div className="absolute top-0 left-0 w-full h-3 bg-slate-900 rounded-t-[64px]"></div>
        {logoUrl ? <img src={logoUrl} className="h-20 mx-auto mb-10 object-contain" /> : <div className="w-24 h-24 bg-slate-900 rounded-[32px] flex items-center justify-center mx-auto mb-10 text-white font-black text-4xl shadow-2xl">UP</div>}
        <h2 className="text-3xl font-black mb-12 uppercase tracking-tighter text-slate-900 leading-none">Acceso UpFest</h2>
        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
             <input required type="text" value={dni} onChange={e => setDni(e.target.value)} className="w-full px-10 py-6 border-none bg-slate-50 rounded-[28px] font-black text-slate-900 outline-none ring-2 ring-transparent focus:ring-orange-500 transition-all text-sm" placeholder="DNI / USUARIO" />
          </div>
          <div className="space-y-2">
             <input required type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-10 py-6 border-none bg-slate-50 rounded-[28px] font-black text-slate-900 outline-none ring-2 ring-transparent focus:ring-orange-500 transition-all text-sm" placeholder="CONTRASEÑA" />
          </div>
          {error && <div className="text-rose-500 text-[9px] font-black uppercase tracking-widest bg-rose-50 p-4 rounded-2xl animate-in shake duration-300">{error}</div>}
          <button type="submit" disabled={loading} className="w-full bg-slate-900 text-white font-black py-6 rounded-[28px] shadow-2xl hover:bg-slate-800 transition-all disabled:opacity-50 text-[11px] uppercase tracking-[0.2em] mt-6">
            {loading ? 'Validando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
};
