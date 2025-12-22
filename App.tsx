
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
  LogOut, CheckCircle, XCircle, AlertTriangle, Plus, Save, Lock, Hash, Upload, Trash2, Ban, Image as ImageIcon, Pencil, X, RotateCcw, Home, FileText, Users, Building, MapPin, Map, Eye, Menu, Settings, ChevronRight, LayoutDashboard, ArrowLeft, Calendar, Download, Search, Filter, FileSpreadsheet, File, Wallet, AlertCircle, TrendingDown, TrendingUp, Sparkles
} from 'lucide-react';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';

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
      <div className="p-6 border-b border-slate-100 flex flex-col items-center">
        {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-16 w-auto object-contain mb-2" />
        ) : (
            <div className="w-12 h-12 bg-slate-900 text-white rounded-full flex items-center justify-center font-bold text-xl mb-2">UP</div>
        )}
        <span className="font-bold text-lg text-slate-800">UpFest Control</span>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        <button onClick={() => setActiveTab('clock')} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'clock' ? 'bg-orange-50 text-orange-700' : 'text-gray-600 hover:bg-gray-50'}`}><Clock size={20}/> Fichadas</button>
        {currentUser.role === Role.ADMIN && (
            <>
                <button onClick={() => setActiveTab('monitor')} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'monitor' ? 'bg-orange-50 text-orange-700' : 'text-gray-600 hover:bg-gray-50'}`}><LayoutDashboard size={20}/> Monitor</button>
                <button onClick={() => setActiveTab('payroll')} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'payroll' ? 'bg-orange-50 text-orange-700' : 'text-gray-600 hover:bg-gray-50'}`}><Wallet size={20}/> Liquidaciones</button>
                <button onClick={() => setActiveTab('admin')} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'admin' ? 'bg-orange-50 text-orange-700' : 'text-gray-600 hover:bg-gray-50'}`}><Users size={20}/> Usuarios</button>
                <button onClick={() => setActiveTab('locations')} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'locations' ? 'bg-orange-50 text-orange-700' : 'text-gray-600 hover:bg-gray-50'}`}><Building size={20}/> Salones</button>
            </>
        )}
      </nav>
      <div className="p-4 border-t border-slate-100">
        <button onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"><LogOut size={20} /> Cerrar Sesión</button>
      </div>
    </aside>
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

                // Agrupamos por día para detectar turnos
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

                    // Detección lógica de incidencia
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
                        aiDetail: "Procesando con IA...",
                        isIncident: isLate || isEarly || isMissing
                    };

                    items.push(item);
                }
            }

            setPayrollItems(items);

            // Generamos detalles de IA en segundo plano para no bloquear
            items.forEach(async (item, idx) => {
                const detail = await generateIncidentExplanation(
                    item.userName, item.scheduledIn, item.realIn, item.scheduledOut, item.realOut
                );
                setPayrollItems(prev => {
                    const updated = [...prev];
                    updated[idx] = { ...updated[idx], aiDetail: detail };
                    return updated;
                });
            });

        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadPayroll(); }, []);

    const exportToPDF = () => {
        const doc = new jsPDF('l', 'mm', 'a4');
        doc.text("Reporte de Liquidación e Incidencias - UpFest", 14, 15);
        autoTable(doc, {
            head: [['#', 'Persona', 'Rol', 'Ingreso Prog.', 'Ingreso Real', 'Egreso Prog.', 'Egreso Real', 'Hs', 'Detalle IA']],
            body: payrollItems.map((item, i) => [
                i + 1, item.userName, item.role, item.scheduledIn, item.realIn, item.scheduledOut, item.realOut, item.diffHours, item.aiDetail
            ]),
            startY: 25,
            theme: 'grid',
            styles: { fontSize: 8 },
            headStyles: { fillColor: [30, 41, 59] }
        });
        doc.save(`UpFest_Liquidacion_${startDate}.pdf`);
    };

    return (
        <div className="p-6 max-w-[1600px] mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-2">
                        Liquidaciones <span className="text-sm font-normal bg-orange-100 text-orange-700 px-2 py-1 rounded">Control de Incidencias</span>
                    </h1>
                    <p className="text-slate-500 mt-1 text-sm">Auditoría automática de ingresos, egresos y cumplimiento de horarios.</p>
                </div>
                <div className="flex gap-3">
                    <button onClick={exportToPDF} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 transition shadow-sm font-medium">
                        <Download size={18} /> Exportar PDF
                    </button>
                    <button onClick={loadPayroll} className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2 rounded-lg hover:bg-slate-800 transition shadow-lg shadow-slate-200 font-bold">
                        <RotateCcw size={18} /> Recargar
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-8 flex flex-col md:flex-row items-end gap-6">
                <div className="grid grid-cols-2 gap-4 flex-1 w-full md:w-auto">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Inicio</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition" />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Fin</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition" />
                        </div>
                    </div>
                </div>
                <button onClick={loadPayroll} className="w-full md:w-auto bg-orange-600 text-white px-8 py-2 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-orange-700 transition shadow-lg shadow-orange-100">
                    <Search size={18} /> Filtrar Datos
                </button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-12 text-center">#</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Persona</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Rol</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Ingreso (P/R)</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Egreso (P/R)</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Total Hs</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Detalle IA</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="p-12 text-center text-slate-400">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
                                            <p className="font-medium">Calculando incidencias y analizando con IA...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : payrollItems.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="p-12 text-center text-slate-400">No se encontraron fichadas en este rango de fechas.</td>
                                </tr>
                            ) : payrollItems.map((item, idx) => (
                                <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${item.isIncident ? 'bg-orange-50/30' : ''}`}>
                                    <td className="p-4 text-center font-mono text-xs text-slate-400">{idx + 1}</td>
                                    <td className="p-4">
                                        <div className="font-bold text-slate-800">{item.userName}</div>
                                    </td>
                                    <td className="p-4">
                                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">{item.role}</span>
                                    </td>
                                    <td className="p-4 text-center">
                                        <div className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">Teórico: {item.scheduledIn}</div>
                                        <div className={`text-sm font-bold ${item.realIn > item.scheduledIn && item.scheduledIn !== '--:--' ? 'text-red-500' : 'text-slate-700'}`}>
                                            Real: {item.realIn}
                                        </div>
                                    </td>
                                    <td className="p-4 text-center">
                                        <div className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">Teórico: {item.scheduledOut}</div>
                                        <div className={`text-sm font-bold ${item.realOut < item.scheduledOut && item.scheduledOut !== '--:--' ? 'text-red-500' : 'text-slate-700'}`}>
                                            Real: {item.realOut}
                                        </div>
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className="text-sm font-mono font-bold bg-slate-100 px-2 py-1 rounded text-slate-700">{item.diffHours}h</span>
                                    </td>
                                    <td className="p-4 max-w-xs">
                                        <div className="flex items-start gap-2">
                                            <Sparkles className="text-orange-500 shrink-0 mt-0.5" size={14} />
                                            <p className="text-xs text-slate-600 leading-relaxed italic">
                                                {item.aiDetail}
                                            </p>
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

// --- Mobile Header ---

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
              {logoUrl ? <img src={logoUrl} alt="Logo" className="h-8 w-auto object-contain" /> : <div className="w-8 h-8 bg-slate-900 text-white rounded-full flex items-center justify-center font-bold text-sm">UP</div>}
              <span className="font-bold text-lg text-slate-800">UpFest</span>
          </div>
          {currentUser && (
              <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-md focus:outline-none">
                {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
          )}
      </div>
      {currentUser && isMobileMenuOpen && (
        <div className="bg-white border-t border-gray-100 shadow-lg px-4 pt-2 pb-4 space-y-2 absolute w-full left-0 z-40 animate-in fade-in slide-in-from-top-2">
            <button onClick={() => { setActiveTab('clock'); setIsMobileMenuOpen(false); }} className={`w-full text-left px-3 py-3 rounded-lg flex items-center gap-3 ${activeTab === 'clock' ? 'bg-orange-50 text-orange-700' : 'text-gray-600'}`}><Clock size={20}/> Fichadas</button>
            {currentUser.role === Role.ADMIN && (
                <>
                    <button onClick={() => { setActiveTab('monitor'); setIsMobileMenuOpen(false); }} className={`w-full text-left px-3 py-3 rounded-lg flex items-center gap-3 ${activeTab === 'monitor' ? 'bg-orange-50 text-orange-700' : 'text-gray-600'}`}><LayoutDashboard size={20}/> Monitor</button>
                    <button onClick={() => { setActiveTab('payroll'); setIsMobileMenuOpen(false); }} className={`w-full text-left px-3 py-3 rounded-lg flex items-center gap-3 ${activeTab === 'payroll' ? 'bg-orange-50 text-orange-700' : 'text-gray-600'}`}><Wallet size={20}/> Liquidaciones</button>
                    <button onClick={() => { setActiveTab('admin'); setIsMobileMenuOpen(false); }} className={`w-full text-left px-3 py-3 rounded-lg flex items-center gap-3 ${activeTab === 'admin' ? 'bg-orange-50 text-orange-700' : 'text-gray-600'}`}><Users size={20}/> Usuarios</button>
                </>
            )}
            <div className="border-t pt-2 mt-2">
                <button onClick={() => { onLogout(); setIsMobileMenuOpen(false); }} className="w-full text-left px-3 py-3 rounded-lg flex items-center gap-3 text-red-600"><LogOut size={20}/> Cerrar Sesión</button>
            </div>
        </div>
      )}
    </header>
  );
};

// --- Login View ---

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
        if (user) onLogin(user);
        else setError('Credenciales incorrectas');
    } catch (e) { setError('Error de conexión'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 space-y-8 border border-slate-100">
        <div className="text-center">
          {logoUrl ? <img src={logoUrl} alt="Logo" className="h-20 w-auto mx-auto mb-4 object-contain" /> : <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-4 text-white font-bold text-2xl shadow-xl">UP</div>}
          <h2 className="text-2xl font-bold text-slate-900">Bienvenido</h2>
          <p className="text-slate-500">Gestión de Personal UpFest</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Usuario / DNI</label>
            <input type="text" value={dni} onChange={e => setDni(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition" placeholder="Ingrese su usuario" required />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Contraseña</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition" placeholder="••••••••" required />
          </div>
          {error && <div className="text-red-500 text-sm text-center bg-red-50 p-3 rounded-xl border border-red-100">{error}</div>}
          <button type="submit" disabled={loading} className={`w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-orange-100 ${loading ? 'opacity-50' : ''}`}>
            {loading ? 'Verificando...' : 'Iniciar Sesión'}
          </button>
        </form>
      </div>
    </div>
  );
};

// --- Dashboard Placeholders ---

const MonitorDashboard = () => <div className="p-8 text-center text-slate-500">Dashboard de Monitoreo en Tiempo Real (Pendiente implementar detalles de geolocalización)</div>;

const AdminDashboard = ({ currentUserId }: { currentUserId: string }) => {
    const [users, setUsers] = useState<User[]>([]);
    useEffect(() => { fetchUsers().then(setUsers); }, []);
    return (
        <div className="p-8">
            <h1 className="text-2xl font-bold mb-6">Gestión de Usuarios</h1>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b">
                        <tr><th className="p-4 font-bold text-slate-500 uppercase text-xs">Nombre</th><th className="p-4 font-bold text-slate-500 uppercase text-xs">Rol</th></tr>
                    </thead>
                    <tbody className="divide-y">
                        {users.map(u => (<tr key={u.id} className="hover:bg-slate-50"><td className="p-4 font-bold">{u.name}</td><td className="p-4 text-sm">{u.role}</td></tr>))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

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
          <MobileHeader activeTab={activeTab} setActiveTab={setActiveTab} currentUser={currentUser} onLogout={() => setCurrentUser(null)} logoUrl={logoUrl} />
          <main className="flex-1 overflow-y-auto">
            {activeTab === 'clock' && <div className="p-12 text-center text-slate-500">Módulo de Fichada Activo (Cámara/GPS).</div>}
            {activeTab === 'monitor' && <MonitorDashboard />}
            {activeTab === 'payroll' && <PayrollDashboard />}
            {activeTab === 'admin' && <AdminDashboard currentUserId={currentUser.id} />}
            {activeTab === 'locations' && <div className="p-12 text-center text-slate-500">Gestión de Salones.</div>}
            {activeTab === 'config' && <div className="p-12 text-center text-slate-500">Configuración del Sistema.</div>}
          </main>
      </div>
    </div>
  );
}
