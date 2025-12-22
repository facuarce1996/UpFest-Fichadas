
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

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(formData); }} className="space-y-4">
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
      <div><label className="text-xs font-bold text-slate-500 uppercase">Contraseña</label><input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full border border-slate-200 rounded-lg p-2 text-sm" required /></div>
      <div>
         <label className="text-xs font-bold text-slate-500 uppercase">Imagen de Referencia (Biometría)</label>
         <input type="file" onChange={handleImageUpload} className="block w-full text-xs mt-1" />
         {imagePreview && <img src={imagePreview} className="mt-2 w-20 h-20 rounded-lg object-cover border" alt="Preview" />}
      </div>
      <div>
        <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Salones Asignados</label>
        <div className="flex flex-wrap gap-2">
            {locations.map(loc => (
                <button key={loc.id} type="button" onClick={() => toggleLocation(loc.id)} className={`px-3 py-1 rounded-full text-xs font-medium border transition ${formData.assignedLocations?.includes(loc.id) ? 'bg-orange-600 text-white border-orange-700' : 'bg-white text-slate-600 border-slate-200'}`}>
                    {loc.name}
                </button>
            ))}
        </div>
      </div>
      <div className="flex gap-3 pt-4 border-t">
          <button type="button" onClick={onCancel} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button type="submit" className="flex-1 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-800 transition">Guardar Usuario</button>
      </div>
    </form>
  );
};

const LocationForm = ({ initialData, onSubmit, onCancel }: { initialData?: Location | null, onSubmit: (l: Location) => void, onCancel: () => void }) => {
    const [formData, setFormData] = useState<Location>({
        id: '', name: '', address: '', city: '', lat: 0, lng: 0, radiusMeters: 100,
        ...initialData
    });

    const handleGetLocation = async () => {
        try {
            const pos = await getCurrentPosition();
            setFormData(prev => ({ ...prev, lat: pos.coords.latitude, lng: pos.coords.longitude }));
        } catch (e) { alert("No se pudo obtener la ubicación actual."); }
    };

    return (
        <form onSubmit={e => { e.preventDefault(); onSubmit(formData); }} className="space-y-4">
            <div><label className="text-xs font-bold text-slate-500 uppercase">Nombre del Salón</label><input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border border-slate-200 rounded-lg p-2 text-sm" required /></div>
            <div><label className="text-xs font-bold text-slate-500 uppercase">Dirección</label><input type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full border border-slate-200 rounded-lg p-2 text-sm" /></div>
            <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs font-bold text-slate-500 uppercase">Latitud</label><input type="number" step="any" value={formData.lat} onChange={e => setFormData({...formData, lat: parseFloat(e.target.value)})} className="w-full border border-slate-200 rounded-lg p-2 text-sm" required /></div>
                <div><label className="text-xs font-bold text-slate-500 uppercase">Longitud</label><input type="number" step="any" value={formData.lng} onChange={e => setFormData({...formData, lng: parseFloat(e.target.value)})} className="w-full border border-slate-200 rounded-lg p-2 text-sm" required /></div>
            </div>
            <button type="button" onClick={handleGetLocation} className="text-xs font-bold text-orange-600 flex items-center gap-1 hover:underline"><MapPin size={14} /> Usar mi ubicación actual</button>
            <div><label className="text-xs font-bold text-slate-500 uppercase">Radio de Tolerancia (metros)</label><input type="number" value={formData.radiusMeters} onChange={e => setFormData({...formData, radiusMeters: parseInt(e.target.value)})} className="w-full border border-slate-200 rounded-lg p-2 text-sm" /></div>
            
            <div className="flex gap-3 pt-4 border-t">
                <button type="button" onClick={onCancel} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" className="flex-1 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-800 transition">Guardar Salón</button>
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

  const load = async () => { setLoading(true); const u = await fetchUsers(); setUsers(u); setLoading(false); };
  useEffect(() => { load(); }, []);

  const handleSave = async (data: User) => {
    await saveUser(data);
    setIsCreating(false); setEditingUser(null); load();
  };

  const handleDelete = async (id: string) => {
      if(confirm('¿Eliminar usuario definitivamente?')) { await deleteUser(id); load(); }
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Personal de UpFest</h1>
          <button onClick={() => setIsCreating(true)} className="bg-slate-900 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-800 transition shadow-lg"><Plus size={18} /> Nuevo Usuario</button>
      </div>
      
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
         <table className="w-full text-left">
            <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Personal</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Legajo</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Rol</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Acciones</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {loading ? (
                    <tr><td colSpan={4} className="p-12 text-center text-slate-400 italic">Cargando personal...</td></tr>
                ) : users.length === 0 ? (
                    <tr><td colSpan={4} className="p-12 text-center text-slate-400 italic">No hay usuarios registrados.</td></tr>
                ) : users.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-100 overflow-hidden shrink-0">
                                    {u.referenceImage ? <img src={u.referenceImage} className="w-full h-full object-cover" /> : <UserIcon size={16} className="m-auto mt-2 text-slate-300"/>}
                                </div>
                                <span className="font-bold text-slate-800">{u.name}</span>
                            </div>
                        </td>
                        <td className="p-4 text-sm text-slate-600">{u.legajo || u.dni}</td>
                        <td className="p-4"><span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">{u.role}</span></td>
                        <td className="p-4 text-right">
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setEditingUser(u)} className="p-1 text-slate-400 hover:text-orange-600 transition" title="Editar"><Pencil size={18}/></button>
                                <button onClick={() => handleDelete(u.id)} className="p-1 text-slate-400 hover:text-red-600 transition" title="Eliminar"><Trash2 size={18}/></button>
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
         </table>
      </div>

      {(isCreating || editingUser) && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto">
              <div className="bg-white rounded-2xl p-8 w-full max-w-lg shadow-2xl my-auto animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-xl text-slate-800">{isCreating ? 'Crear Nuevo Usuario' : 'Editar Usuario'}</h3>
                      <button onClick={() => { setIsCreating(false); setEditingUser(null); }} className="text-slate-400 hover:text-slate-600"><X/></button>
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

    const load = async () => { setLoading(true); const l = await fetchLocations(); setLocations(l); setLoading(false); };
    useEffect(() => { load(); }, []);

    const handleSave = async (data: Location) => {
        await saveLocation(data);
        setIsCreating(false); setEditingLoc(null); load();
    };

    const handleDelete = async (id: string) => {
        if(confirm('¿Eliminar salón definitivamente?')) { await deleteLocation(id); load(); }
    };

    return (
        <div className="max-w-7xl mx-auto p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-slate-800">Salones y Sucursales</h1>
                <button onClick={() => setIsCreating(true)} className="bg-slate-900 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-800 transition shadow-lg"><Plus size={18} /> Nuevo Salón</button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    <div className="col-span-full py-12 text-center text-slate-400 italic">Cargando salones...</div>
                ) : locations.length === 0 ? (
                    <div className="col-span-full py-12 text-center text-slate-400 italic">No hay salones registrados todavía.</div>
                ) : locations.map(loc => (
                    <div key={loc.id} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition group">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-orange-100 text-orange-600 rounded-xl"><MapPinned size={24} /></div>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => setEditingLoc(loc)} className="p-2 bg-slate-50 text-slate-400 hover:text-orange-600 rounded-lg"><Pencil size={16}/></button>
                                <button onClick={() => handleDelete(loc.id)} className="p-2 bg-slate-50 text-slate-400 hover:text-red-600 rounded-lg"><Trash2 size={16}/></button>
                            </div>
                        </div>
                        <h3 className="font-extrabold text-slate-800 text-lg mb-1">{loc.name}</h3>
                        <p className="text-sm text-slate-500 mb-4">{loc.address}, {loc.city}</p>
                        <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
                            <span className="bg-slate-50 px-2 py-1 rounded">LAT: {loc.lat.toFixed(4)}</span>
                            <span className="bg-slate-50 px-2 py-1 rounded">LNG: {loc.lng.toFixed(4)}</span>
                            <span className="bg-slate-50 px-2 py-1 rounded text-orange-600">RADIO: {loc.radiusMeters}m</span>
                        </div>
                    </div>
                ))}
            </div>

            {(isCreating || editingLoc) && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-xl text-slate-800">{isCreating ? 'Añadir Salón' : 'Editar Salón'}</h3>
                            <button onClick={() => { setIsCreating(false); setEditingLoc(null); }} className="text-slate-400 hover:text-slate-600"><X/></button>
                        </div>
                        <LocationForm initialData={editingLoc} onSubmit={handleSave} onCancel={() => { setIsCreating(false); setEditingLoc(null); }} />
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Payroll Module (Refined) ---

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
                        aiDetail: "Analizando discrepancias...",
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
                    <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-2">Liquidaciones</h1>
                    <p className="text-slate-500 mt-1 text-sm">Panel de auditoría de cumplimiento horario impulsado por IA.</p>
                </div>
                <div className="flex gap-3">
                    <button onClick={exportToPDF} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 transition shadow-sm font-bold text-sm">
                        <Download size={18} /> Descargar PDF
                    </button>
                    <button onClick={loadPayroll} className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2 rounded-lg hover:bg-slate-800 transition shadow-lg shadow-slate-200 font-bold text-sm">
                        <RotateCcw size={18} /> Actualizar
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-8 flex flex-col md:flex-row items-end gap-6">
                <div className="grid grid-cols-2 gap-4 flex-1">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Inicio</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 outline-none transition" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Fin</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 outline-none transition" />
                    </div>
                </div>
                <button onClick={loadPayroll} className="w-full md:w-auto bg-orange-600 text-white px-8 py-2 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-orange-700 transition shadow-lg shadow-orange-100">
                    <Search size={18} /> Filtrar
                </button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center w-12">#</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Persona</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Rol</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Hora Ingreso</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">H. Ingreso Real</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Hora Egreso</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">H. Egreso Real</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Hs</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Detalle IA</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr><td colSpan={9} className="p-12 text-center text-slate-400 italic">Generando análisis con IA...</td></tr>
                            ) : payrollItems.map((item, idx) => (
                                <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${item.isIncident ? 'bg-orange-50/20' : ''}`}>
                                    <td className="p-4 text-center font-mono text-xs text-slate-400">{idx + 1}</td>
                                    <td className="p-4 font-bold text-slate-800">{item.userName}</td>
                                    <td className="p-4"><span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full border border-slate-200">{item.role}</span></td>
                                    <td className="p-4 text-center text-xs font-bold text-slate-400">{item.scheduledIn}</td>
                                    <td className={`p-4 text-center text-sm font-extrabold ${item.realIn > item.scheduledIn && item.scheduledIn !== '--:--' ? 'text-red-500' : 'text-slate-700'}`}>{item.realIn}</td>
                                    <td className="p-4 text-center text-xs font-bold text-slate-400">{item.scheduledOut}</td>
                                    <td className={`p-4 text-center text-sm font-extrabold ${item.realOut < item.scheduledOut && item.scheduledOut !== '--:--' ? 'text-red-500' : 'text-slate-700'}`}>{item.realOut}</td>
                                    <td className="p-4 text-center font-mono font-bold text-slate-700">{item.diffHours}h</td>
                                    <td className="p-4 max-w-xs">
                                        <div className="flex items-start gap-2 italic text-xs text-slate-600">
                                            <Sparkles size={12} className="text-orange-500 mt-1 shrink-0" />
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
    <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200 h-screen sticky top-0 shadow-sm">
        <div className="p-8 border-b border-slate-50 flex flex-col items-center">
            {logoUrl ? <img src={logoUrl} alt="Logo" className="h-14 w-auto object-contain mb-3" /> : <div className="w-12 h-12 bg-slate-900 text-white rounded-full flex items-center justify-center font-bold text-xl mb-3 shadow-lg">UP</div>}
            <span className="font-black text-slate-900 tracking-tighter text-xl">UPFEST CONTROL</span>
        </div>
        <nav className="flex-1 p-4 space-y-1">
            <button onClick={() => setActiveTab('clock')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition ${activeTab === 'clock' ? 'bg-orange-50 text-orange-700' : 'text-slate-500 hover:bg-slate-50'}`}><Clock size={20}/> Fichadas</button>
            {currentUser.role === Role.ADMIN && (
                <>
                    <button onClick={() => setActiveTab('payroll')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition ${activeTab === 'payroll' ? 'bg-orange-50 text-orange-700' : 'text-slate-500 hover:bg-slate-50'}`}><Wallet size={20}/> Liquidaciones</button>
                    <button onClick={() => setActiveTab('admin')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition ${activeTab === 'admin' ? 'bg-orange-50 text-orange-700' : 'text-slate-500 hover:bg-slate-50'}`}><Users size={20}/> Usuarios</button>
                    <button onClick={() => setActiveTab('locations')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition ${activeTab === 'locations' ? 'bg-orange-50 text-orange-700' : 'text-slate-500 hover:bg-slate-50'}`}><Building size={20}/> Salones</button>
                </>
            )}
        </nav>
        <div className="p-4 border-t border-slate-50">
            <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-red-500 hover:bg-red-50 transition"><LogOut size={20} /> Salir</button>
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
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} currentUser={currentUser} onLogout={() => setCurrentUser(null)} logoUrl={logoUrl} />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
          <main className="flex-1 overflow-y-auto">
            {activeTab === 'clock' && <div className="p-12 text-center text-slate-500 italic">Módulo de Fichada Activo para el personal.</div>}
            {activeTab === 'payroll' && <PayrollDashboard />}
            {activeTab === 'admin' && <AdminDashboard />}
            {activeTab === 'locations' && <LocationsDashboard />}
          </main>
      </div>
    </div>
  );
}

// Reutilizamos LoginView y Header de la versión anterior para brevedad
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
        else setError('Credenciales inválidas');
    } catch (e) { setError('Error de conexión'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 font-sans">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-10 space-y-8 border border-slate-100">
        <div className="text-center">
          {logoUrl ? <img src={logoUrl} alt="Logo" className="h-16 w-auto mx-auto mb-4" /> : <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-4 text-white font-black text-2xl shadow-xl">UP</div>}
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">HOLA DE NUEVO</h2>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Panel de Control UpFest</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <input type="text" value={dni} onChange={e => setDni(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-orange-500/10 outline-none transition font-medium" placeholder="Usuario / DNI" required />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-orange-500/10 outline-none transition font-medium" placeholder="Contraseña" required />
          {error && <div className="text-red-500 text-xs text-center font-bold bg-red-50 p-3 rounded-xl border border-red-100">{error}</div>}
          <button type="submit" disabled={loading} className={`w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-4 rounded-2xl transition shadow-xl shadow-slate-200 ${loading ? 'opacity-50' : ''}`}>
            {loading ? 'CARGANDO...' : 'ENTRAR AL PANEL'}
          </button>
        </form>
      </div>
    </div>
  );
};
