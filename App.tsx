
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
  LogOut, CheckCircle, XCircle, AlertTriangle, Plus, Save, Lock, Hash, Upload, Trash2, ImageIcon, Pencil, X, RotateCcw, FileText, Users, Building, MapPin, Monitor, Maximize2, Laptop, FileUp, Key, Bell, BellRing, Wallet, MapPinned, RefreshCw, UserCheck, Shirt, Download, FileSpreadsheet, Menu, ArrowRight, Calendar, Briefcase, Filter, Search, XOctagon, Check, Navigation, Target, Activity
} from 'lucide-react';
import * as XLSX from 'xlsx';

// --- Helpers de Plataforma ---
const getAIStudio = () => (window as any).aistudio;

const checkApiKeyStatus = async () => {
  const aiStudio = getAIStudio();
  if (aiStudio && aiStudio.hasSelectedApiKey) {
    return await aiStudio.hasSelectedApiKey();
  }
  return true; // Si no estamos en AI Studio, asumimos que no hay selector
};

const handleOpenApiKeyDialog = async () => {
  const aiStudio = getAIStudio();
  if (aiStudio && aiStudio.openSelectKey) {
    try {
      await aiStudio.openSelectKey();
    } catch (e) {
      console.error("Error al abrir selector de llave:", e);
    }
  }
};

const getFormattedDate = (dateStr: string) => {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch (e) {
    return 'Fecha inválida';
  }
};

const formatMinutes = (mins: number) => {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
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
  const [hasApiKey, setHasApiKey] = useState(true);
  
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [isFiltering, setIsFiltering] = useState(false);
  const [activeQuickFilter, setActiveQuickFilter] = useState<string | null>(null);
  
  const [successAction, setSuccessAction] = useState<{ type: string, countdown: number } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    checkApiKeyStatus().then(setHasApiKey);
  }, []);

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

  const applyQuickFilter = (type: 'today' | 'yesterday' | 'week' | 'month') => {
    const today = new Date();
    let start = new Date();
    let end = new Date();
    setActiveQuickFilter(type);
    switch(type) {
      case 'today': break;
      case 'yesterday': start.setDate(today.getDate() - 1); end.setDate(today.getDate() - 1); break;
      case 'week': start.setDate(today.getDate() - 7); break;
      case 'month': start.setDate(1); break;
    }
    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    const s = formatDate(start);
    const e = formatDate(end);
    setFilterStartDate(s);
    setFilterEndDate(e);
    loadData(true, s, e);
  };

  const handleApplyFilter = () => { if (filterStartDate && filterEndDate) { setActiveQuickFilter(null); loadData(true); } };
  const handleClearFilter = () => { setFilterStartDate(''); setFilterEndDate(''); setActiveQuickFilter(null); loadData(true, '', ''); };

  const getShiftDuration = (log: LogEntry, logList: LogEntry[]) => {
    if (log.type !== 'CHECK_OUT') return null;
    const userLogsInOrder = [...logList]
      .filter(l => l.userId === log.userId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    const currentIndex = userLogsInOrder.findIndex(l => l.id === log.id);
    if (currentIndex <= 0) return null;

    const previousLog = userLogsInOrder[currentIndex - 1];
    if (previousLog.type === 'CHECK_IN') {
      const diff = new Date(log.timestamp).getTime() - new Date(previousLog.timestamp).getTime();
      const mins = Math.floor(diff / 60000);
      return mins > 0 ? mins : null;
    }
    return null;
  };

  const handleExportExcel = () => {
    if (adminLogs.length === 0) return alert("No hay datos para exportar.");
    
    const userMap = new Map<string, LogEntry[]>();
    adminLogs.forEach(log => {
      const userLogs = userMap.get(log.userId) || [];
      userLogs.push(log);
      userMap.set(log.userId, userLogs);
    });

    const reportData: any[] = [];

    userMap.forEach((logs) => {
      const sorted = [...logs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      for (let i = 0; i < sorted.length; i++) {
        const current = sorted[i];
        
        if (current.type === 'CHECK_IN') {
          const next = sorted[i + 1];
          if (next && next.type === 'CHECK_OUT') {
            const start = new Date(current.timestamp);
            const end = new Date(next.timestamp);
            const diffMs = end.getTime() - start.getTime();
            const diffMins = Math.round(diffMs / 60000);

            reportData.push({
              'LEGAJO': current.legajo,
              'NOMBRE': current.userName,
              'FECHA INGRESO': start.toLocaleDateString('es-AR'),
              'HORA INGRESO': start.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }),
              'FECHA EGRESO': end.toLocaleDateString('es-AR'),
              'HORA EGRESO': end.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }),
              'MINUTOS TRABAJADOS': diffMins,
              'DURACION': formatMinutes(diffMins),
              'VALIDA ROSTRO': current.identityStatus === 'MATCH' ? 'SI' : 'NO',
              'VALIDA VESTIMENTA': current.dressCodeStatus === 'PASS' ? 'SI' : 'NO',
              'SEDE': current.locationName,
              'DESCRIPCION IA': current.aiFeedback
            });
            i++; 
          } else {
            reportData.push({
              'LEGAJO': current.legajo,
              'NOMBRE': current.userName,
              'FECHA INGRESO': new Date(current.timestamp).toLocaleDateString('es-AR'),
              'HORA INGRESO': new Date(current.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }),
              'FECHA EGRESO': '---',
              'HORA EGRESO': '---',
              'MINUTOS TRABAJADOS': 0,
              'DURACION': 'Sin egreso',
              'VALIDA ROSTRO': current.identityStatus === 'MATCH' ? 'SI' : 'NO',
              'VALIDA VESTIMENTA': current.dressCodeStatus === 'PASS' ? 'SI' : 'NO',
              'SEDE': current.locationName,
              'DESCRIPCION IA': current.aiFeedback
            });
          }
        } else if (current.type === 'CHECK_OUT') {
          reportData.push({
            'LEGAJO': current.legajo,
            'NOMBRE': current.userName,
            'FECHA INGRESO': '---',
            'HORA INGRESO': '---',
            'FECHA EGRESO': new Date(current.timestamp).toLocaleDateString('es-AR'),
            'HORA EGRESO': new Date(current.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }),
            'MINUTOS TRABAJADOS': 0,
            'DURACION': 'Sin ingreso',
            'VALIDA ROSTRO': 'NO',
            'VALIDA VESTIMENTA': 'NO',
            'SEDE': current.locationName,
            'DESCRIPCION IA': 'Egreso registrado sin ingreso previo'
          });
        }
      }
    });

    reportData.sort((a, b) => {
      const dateAStr = a['FECHA INGRESO'] !== '---' ? a['FECHA INGRESO'] : a['FECHA EGRESO'];
      const dateBStr = b['FECHA INGRESO'] !== '---' ? b['FECHA INGRESO'] : b['FECHA EGRESO'];
      const dateA = new Date(dateAStr.split('/').reverse().join('-')).getTime();
      const dateB = new Date(dateAStr.split('/').reverse().join('-')).getTime();
      return dateB - dateA;
    });

    const ws = XLSX.utils.json_to_sheet(reportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fichadas UpFest");
    XLSX.writeFile(wb, `Reporte_Asistencia_UpFest_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  useEffect(() => {
    let active = true;
    async function startCamera() {
      if (cameraActive) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } } });
          if (active && videoRef.current) { streamRef.current = stream; videoRef.current.srcObject = stream; }
          else { stream.getTracks().forEach(t => t.stop()); }
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
        // Si hay un error de autenticación, solicitamos abrir el selector de llaves
        if (err.message.includes("401") || err.message.includes("Key") || err.message.includes("403")) {
          setLoadingMsg("CONFIGURANDO LLAVE...");
          await handleOpenApiKeyDialog();
          // Intentamos nuevamente después de abrir el selector
          iaResult = await analyzeCheckIn(photo, user.dressCode, user.referenceImage);
        } else {
          throw err;
        }
      }

      const lastLog = await fetchLastLog(user.id);
      const type = (!lastLog || lastLog.type === 'CHECK_OUT') ? 'CHECK_IN' : 'CHECK_OUT';
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
      alert("Error en validación: " + error.message + ". Asegúrese de tener una llave configurada.");
      await handleOpenApiKeyDialog();
    } finally { setLoading(false); setLoadingMsg(''); }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        if (videoRef.current.videoWidth === 0) return;
        
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.8);
        
        if (dataUrl && dataUrl.length > 10) {
          setPhoto(dataUrl);
          setCameraActive(false);
        } else {
          console.error("Captura de foto fallida: dataUrl inválido.");
        }
      }
    }
  };

  const handleDeleteLog = async (logId: string) => {
    if (!confirm('¿CONFIRMAS BORRAR ESTA FICHADA?')) return;
    setIsDeleting(logId);
    try { await deleteLog(logId); setAdminLogs(prev => prev.filter(l => l.id !== logId)); } 
    catch (e: any) { alert(e.message); } finally { setIsDeleting(null); }
  };

  if (user.role === 'Admin') {
    const incidentLogs = adminLogs.filter(l => l.dressCodeStatus === 'FAIL' || l.identityStatus === 'NO_MATCH');
    return (
      <div className="max-w-full mx-auto p-4 md:p-8 space-y-6 md:space-y-8 animate-in fade-in duration-500">
        {!hasApiKey && (
           <div className="bg-blue-600 text-white p-6 rounded-[32px] flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl shadow-blue-200">
              <div className="flex items-center gap-4">
                 <Key size={32} className="animate-pulse" />
                 <div>
                    <h4 className="font-black uppercase tracking-tighter">Llave de IA no configurada</h4>
                    <p className="text-[10px] font-bold uppercase opacity-80">Debe seleccionar una Paid Key para habilitar la validación biométrica.</p>
                 </div>
              </div>
              <button onClick={handleOpenApiKeyDialog} className="bg-white text-blue-600 px-8 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg hover:bg-slate-50 transition-all">CONFIGURAR AHORA</button>
           </div>
        )}

        <div className="bg-white rounded-[24px] md:rounded-[32px] p-5 md:p-10 border border-slate-200 shadow-sm overflow-hidden">
           <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-6">
              <div className="text-center md:text-left">
                <h3 className="text-xl md:text-2xl font-black text-slate-900 tracking-tighter uppercase flex items-center justify-center md:justify-start gap-3">
                  <Monitor className="text-orange-600" /> MONITOR DE PERSONAL
                </h3>
                <p className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest">En vivo - UpFest Control</p>
              </div>
              <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto justify-center">
                <button onClick={handleExportExcel} className="flex-1 md:flex-none px-4 md:px-6 py-3 md:py-4 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center gap-3 transition-all hover:bg-emerald-100 shadow-sm">
                    <Download size={18}/><span className="text-[10px] font-black uppercase">Exportar Reporte</span>
                </button>
                <button onClick={() => setShowAlerts(!showAlerts)} className={`flex-1 md:flex-none px-4 md:px-6 py-3 md:py-4 rounded-full border flex items-center justify-center gap-3 transition-all ${incidentLogs.length > 0 ? 'bg-red-50 border-red-200 text-red-600 shadow-lg shadow-red-100' : 'bg-slate-50 text-slate-400'}`}>
                    <Bell size={18} className={incidentLogs.length > 0 ? 'animate-bounce' : ''}/><span className="text-[10px] font-black uppercase">Alertas ({incidentLogs.length})</span>
                </button>
              </div>
           </div>

           <div className="mb-8 p-6 md:p-8 bg-slate-50/80 rounded-[28px] md:rounded-[40px] border border-slate-100 space-y-8">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-2 flex items-center gap-2"><Filter size={14}/> Filtros Rápidos:</span>
                {[
                    { id: 'today', label: 'Hoy', icon: Clock },
                    { id: 'yesterday', label: 'Ayer', icon: RotateCcw },
                    { id: 'week', label: '7 Días', icon: Calendar },
                    { id: 'month', label: 'Este Mes', icon: Briefcase }
                ].map(f => (
                    <button key={f.id} onClick={() => applyQuickFilter(f.id as any)} className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all border-2 ${activeQuickFilter === f.id ? 'bg-orange-600 border-orange-600 text-white shadow-xl shadow-orange-200' : 'bg-white border-slate-100 text-slate-500 hover:border-orange-400'}`}>
                        <f.icon size={14}/> {f.label}
                    </button>
                ))}
                {(filterStartDate || filterEndDate) && (
                    <button onClick={handleClearFilter} className="px-5 py-2.5 bg-rose-50 text-rose-600 border-2 border-rose-100 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-rose-100 transition-colors"><XOctagon size={14}/> Limpiar</button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-11 items-end gap-4 border-t border-slate-200 pt-8">
                <div className="md:col-span-4 space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Calendar size={14}/> Fecha Inicio</label>
                    <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="w-full bg-white border-2 border-slate-100 p-4 rounded-2xl font-bold text-xs outline-none focus:border-orange-500 shadow-sm" />
                </div>
                <div className="md:col-span-4 space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Calendar size={14}/> Fecha Fin</label>
                    <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="w-full bg-white border-2 border-slate-100 p-4 rounded-2xl font-bold text-xs outline-none focus:border-orange-500 shadow-sm" />
                </div>
                <div className="md:col-span-3 flex gap-2">
                    <button onClick={handleApplyFilter} disabled={isFiltering} className="flex-1 bg-slate-900 text-white px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-slate-800 disabled:opacity-50 shadow-xl transition-all">
                        {isFiltering ? <RefreshCw className="animate-spin" size={16}/> : <Search size={16}/>} Filtrar Rango
                    </button>
                </div>
              </div>
           </div>

           <div className="overflow-x-auto bg-slate-50/50 rounded-[20px] md:rounded-[32px] border border-slate-100">
              <table className="w-full text-left min-w-[1200px] border-collapse">
                <thead>
                  <tr className="bg-[#0f172a] text-white">
                    <th className="p-6 text-[10px] font-black uppercase text-center w-24">Foto</th>
                    <th className="p-6 text-[10px] font-black uppercase">Colaborador</th>
                    <th className="p-6 text-[10px] font-black uppercase text-center">Fecha / Hora</th>
                    <th className="p-6 text-[10px] font-black uppercase text-center">Tipo</th>
                    <th className="p-6 text-[10px] font-black uppercase text-center">Duración</th>
                    <th className="p-6 text-[10px] font-black uppercase text-center border-l border-white/10">Identidad</th>
                    <th className="p-6 text-[10px] font-black uppercase text-center">Vestimenta</th>
                    <th className="p-6 text-[10px] font-black uppercase">Descripción IA</th>
                    <th className="p-6 text-[10px] font-black uppercase text-center w-20">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {adminLogs.length === 0 ? (
                    <tr><td colSpan={9} className="p-32 text-center text-slate-300 font-black uppercase tracking-[0.2em] italic">Sin registros</td></tr>
                  ) : adminLogs.map(log => {
                    const durationMins = getShiftDuration(log, adminLogs);
                    return (
                      <tr key={log.id} className="hover:bg-white transition-all">
                        <td className="p-6 text-center">
                          <div onClick={() => log.photoEvidence && setZoomedImage(log.photoEvidence)} className="w-14 h-14 mx-auto rounded-xl overflow-hidden border-2 border-white cursor-zoom-in shadow-md">
                            {log.photoEvidence ? <img src={log.photoEvidence} className="w-full h-full object-cover" /> : <div className="bg-slate-100 w-full h-full flex items-center justify-center"><UserIcon className="text-slate-300" /></div>}
                          </div>
                        </td>
                        <td className="p-6">
                          <span className="block font-black text-slate-900 text-xs md:text-sm uppercase tracking-tight">{log.userName}</span>
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Lgj: {log.legajo} | {log.locationName}</span>
                        </td>
                        <td className="p-6 text-center">
                            <span className="text-[10px] md:text-xs font-black text-slate-900 font-mono uppercase bg-slate-100 px-3 py-1 rounded-lg">{new Date(log.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                            <span className="block text-[9px] text-slate-400 uppercase font-black mt-1.5">{getFormattedDate(log.timestamp)}</span>
                        </td>
                        <td className="p-6 text-center">
                          <span className={`px-5 py-2 rounded-full text-[9px] font-black uppercase border-2 ${log.type === 'CHECK_IN' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                            {log.type === 'CHECK_IN' ? 'INGRESO' : 'EGRESO'}
                          </span>
                        </td>
                        <td className="p-6 text-center">
                           {durationMins !== null ? (
                             <div className="flex flex-col items-center">
                               <span className="text-[10px] font-black text-slate-900 bg-orange-100 text-orange-700 px-2 py-1 rounded-lg">{formatMinutes(durationMins)}</span>
                               <span className="text-[8px] font-black text-slate-400 uppercase mt-1">({durationMins} min)</span>
                             </div>
                           ) : <span className="text-slate-200">---</span>}
                        </td>
                        <td className="p-6 text-center border-l border-slate-100">
                          <span className={`text-[9px] font-black uppercase px-3 py-1 rounded-lg ${log.identityStatus === 'MATCH' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{log.identityStatus === 'MATCH' ? 'Válido' : 'Fallo'}</span>
                        </td>
                        <td className="p-6 text-center">
                          <span className={`text-[9px] font-black uppercase px-3 py-1 rounded-lg ${log.dressCodeStatus === 'PASS' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{log.dressCodeStatus === 'PASS' ? 'Correcto' : 'Error'}</span>
                        </td>
                        <td className="p-6 max-w-xs">
                          <p className="text-[10px] italic text-slate-500 leading-relaxed line-clamp-2">"{log.aiFeedback}"</p>
                        </td>
                        <td className="p-6 text-center">
                          <button disabled={isDeleting === log.id} onClick={() => handleDeleteLog(log.id)} className="p-3 text-slate-200 hover:text-red-500 transition-all">{isDeleting === log.id ? <RefreshCw className="animate-spin" size={16}/> : <Trash2 size={20}/>}</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
           </div>
        </div>
        {zoomedImage && (<div className="fixed inset-0 z-[200] bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setZoomedImage(null)}><img src={zoomedImage} className="max-w-full max-h-full rounded-[40px] shadow-2xl border-4 md:border-8 border-white animate-in zoom-in-95" /></div>)}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 relative">
      {!hasApiKey && (
         <div className="bg-amber-50 border-2 border-amber-200 p-4 rounded-3xl flex items-center gap-4 text-amber-800">
            <AlertTriangle className="shrink-0" />
            <p className="text-[10px] font-black uppercase tracking-widest leading-tight">Configuración de IA incompleta. La validación biométrica no funcionará hasta seleccionar una Paid Key.</p>
         </div>
      )}

      {successAction && (
        <div className="fixed inset-0 z-[150] bg-slate-50 flex flex-col items-center justify-center animate-in fade-in duration-300">
           <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mb-8 animate-bounce"><CheckCircle size={40} className="text-blue-600" /></div>
           <h2 className="text-4xl font-black uppercase tracking-tighter mb-4 text-slate-800">¡{successAction.type} REGISTRADO!</h2>
           <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-12">Redirigiendo en {successAction.countdown} segundos...</p>
           <button onClick={onLogout} className="text-xs font-black uppercase text-slate-300 hover:text-blue-600 tracking-widest transition-colors">Cerrar sesión ahora</button>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-[32px] md:rounded-[40px] p-8 border shadow-xl flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-black uppercase tracking-tighter">Fichador</h2>
            {deviceLocation && <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">{deviceLocation.name}</span>}
          </div>
          <div className="aspect-square rounded-[32px] overflow-hidden bg-slate-900 mb-6 relative border-4 border-slate-100 shadow-inner">
             {!cameraActive && !photo && (
               <button onClick={() => setCameraActive(true)} className="absolute inset-0 text-white font-black uppercase text-xs flex flex-col items-center justify-center gap-4 hover:bg-slate-800 transition-colors">
                 <div className="w-16 h-16 rounded-full bg-orange-600 flex items-center justify-center shadow-xl ring-8 ring-orange-50"><Camera size={28}/></div>
                 Activar Cámara
               </button>
             )}
             {cameraActive && <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover scale-x-[-1]" />}
             {photo && <img src={photo} className="w-full h-full object-cover" />}
             {loading && (
               <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center text-white p-6 text-center z-10">
                 <RefreshCw className="animate-spin mb-4" size={32} />
                 <p className="font-black text-[10px] uppercase tracking-widest">{loadingMsg || 'Procesando...'}</p>
               </div>
             )}
          </div>
          <div className="space-y-3">
            {cameraActive && <button onClick={capturePhoto} className="w-full py-5 bg-orange-600 text-white rounded-[24px] font-black uppercase tracking-widest shadow-xl transition-all active:scale-95">Capturar Foto</button>}
            {photo && !loading && <button onClick={handleClockAction} className="w-full py-5 bg-slate-900 text-white rounded-[24px] font-black uppercase tracking-widest shadow-xl flex items-center justify-center gap-3">Confirmar Fichada <ArrowRight size={20}/></button>}
            {photo && !loading && <button onClick={() => { setPhoto(null); setCameraActive(true); }} className="w-full py-4 bg-slate-100 text-slate-500 rounded-[20px] font-black uppercase text-[10px] tracking-widest">Tomar otra foto</button>}
          </div>
        </div>
        <div className="space-y-6 flex flex-col">
          <div className="bg-white rounded-[32px] p-8 border shadow-sm">
            <h3 className="font-black text-[10px] uppercase text-slate-400 tracking-widest mb-4">Perfil</h3>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-slate-50 overflow-hidden border-2 border-slate-100 shadow-sm shrink-0">
                {user.referenceImage ? <img src={user.referenceImage} className="w-full h-full object-cover" /> : <div className="bg-slate-100 w-full h-full flex items-center justify-center"><UserIcon className="text-slate-300" /></div>}
              </div>
              <div>
                <h4 className="font-black text-lg text-slate-900 uppercase leading-none">{user.name}</h4>
                <p className="text-[9px] font-bold text-slate-500 mt-1.5 uppercase bg-slate-100 px-2 py-0.5 rounded inline-block">{user.role}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-[32px] p-8 border shadow-sm flex-1 overflow-hidden min-h-[350px]">
             <h3 className="font-black text-[10px] uppercase text-slate-400 tracking-widest mb-6 flex justify-between">
                <span>Historial de Hoy</span>
                <span className="text-slate-900 font-mono">{new Date().toLocaleDateString('es-AR', {day:'2-digit', month:'short'})}</span>
             </h3>
             <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {userTodayLogs.length === 0 ? (
                  <div className="py-20 text-center border-4 border-dashed rounded-[32px] border-slate-50 text-slate-200 uppercase text-[10px] font-black">Sin movimientos hoy</div>
                ) : userTodayLogs.map(l => {
                  const durationMins = getShiftDuration(l, userTodayLogs);
                  return (
                    <div key={l.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-4">
                          <div className={`p-2.5 rounded-xl ${l.type === 'CHECK_IN' ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-white'}`}>
                              {l.type === 'CHECK_IN' ? <UserCheck size={18}/> : <LogOut size={18}/>}
                          </div>
                          <div>
                              <span className="block font-black text-xs uppercase">{l.type === 'CHECK_IN' ? 'Ingreso' : 'Egreso'}</span>
                              <span className="text-[9px] font-bold text-slate-400 uppercase leading-none">{l.locationName}</span>
                          </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="font-mono font-black text-sm text-slate-900 bg-white px-3 py-1 rounded-lg border shadow-sm">{new Date(l.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                        {durationMins !== null && (
                          <span className="text-[9px] font-black text-orange-600 uppercase mt-1">Trabajado: {formatMinutes(durationMins)}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
             </div>
          </div>
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

// --- LoginView ---
const LoginView = ({ onLogin, logoUrl }: { onLogin: (u: User) => void, logoUrl: string | null }) => {
  const [dni, setDni] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const user = await authenticateUser(dni, password);
      if (user) onLogin(user);
      else setError('Credenciales inválidas');
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-[40px] shadow-2xl border border-slate-100 p-10 space-y-8 animate-in fade-in slide-in-from-bottom-8">
        <div className="text-center space-y-4">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-16 mx-auto object-contain" />
          ) : (
            <div className="w-16 h-16 bg-orange-600 rounded-2xl flex items-center justify-center mx-auto shadow-xl shadow-orange-100">
              <Shield className="text-white" size={32} />
            </div>
          )}
          <h1 className="text-3xl font-black tracking-tighter uppercase text-slate-900">UpFest Access</h1>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Sistema de Control de Personal</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">DNI / Usuario</label>
            <div className="relative">
              <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input 
                type="text" 
                value={dni} 
                onChange={(e) => setDni(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-50 p-4 pl-12 rounded-2xl font-bold text-sm outline-none focus:border-orange-500 focus:bg-white transition-all shadow-inner"
                placeholder="Ingresa tu DNI"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Contraseña</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-50 p-4 pl-12 rounded-2xl font-bold text-sm outline-none focus:border-orange-500 focus:bg-white transition-all shadow-inner"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {error && (
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600 animate-in shake">
              <AlertTriangle size={18} />
              <span className="text-[10px] font-black uppercase tracking-widest">{error}</span>
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-slate-200 flex items-center justify-center gap-3 hover:bg-slate-800 transition-all disabled:opacity-50"
          >
            {loading ? <RefreshCw className="animate-spin" /> : <ArrowRight />}
            Ingresar al Sistema
          </button>
        </form>
      </div>
    </div>
  );
};

// --- Sidebar ---
const Sidebar = ({ activeTab, setActiveTab, currentUser, onLogout, logoUrl, isMobileMenuOpen, setIsMobileMenuOpen }: any) => {
  const menuItems = [
    { id: 'clock', label: 'Fichador', icon: Clock },
    { id: 'admin', label: 'Personal', icon: Users, adminOnly: true },
    { id: 'locations', label: 'Sedes', icon: MapPin, adminOnly: true },
  ];

  const filteredItems = menuItems.filter(item => !item.adminOnly || currentUser.role === 'Admin');

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] md:hidden" onClick={() => setIsMobileMenuOpen(false)} />
      )}
      
      {/* Sidebar Content */}
      <aside className={`fixed md:static inset-y-0 left-0 w-72 bg-white border-r border-slate-100 z-[70] flex flex-col transition-transform duration-300 transform ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="p-8 flex items-center gap-4">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-10 object-contain" />
          ) : (
            <div className="w-10 h-10 bg-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-100">
              <Shield className="text-white" size={20} />
            </div>
          )}
          <span className="font-black text-xl tracking-tighter uppercase">UpFest</span>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          {filteredItems.map(item => (
            <button
              key={item.id}
              onClick={() => { setActiveTab(item.id); setIsMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === item.id ? 'bg-orange-600 text-white shadow-xl shadow-orange-100' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-900'}`}
            >
              <item.icon size={20} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-50 space-y-4">
          <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl">
            <div className="w-10 h-10 rounded-xl bg-white border shadow-sm flex items-center justify-center text-slate-300 overflow-hidden">
               {currentUser.referenceImage ? <img src={currentUser.referenceImage} className="w-full h-full object-cover rounded-xl" /> : <UserIcon size={20} />}
            </div>
            <div className="overflow-hidden">
              <p className="font-black text-[10px] text-slate-900 uppercase truncate">{currentUser.name}</p>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{currentUser.role}</p>
            </div>
          </div>
          <button onClick={onLogout} className="w-full flex items-center gap-4 px-6 py-4 text-rose-500 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-rose-50 transition-all">
            <LogOut size={20} />
            Cerrar Sesión
          </button>
        </div>
      </aside>
    </>
  );
};

// --- AdminDashboard ---
const AdminDashboard = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    setLoading(true);
    const data = await fetchUsers();
    setUsers(data);
    setLoading(false);
  };

  const handleSave = async (user: User) => {
    try {
      await saveUser(user);
      setShowModal(false);
      loadUsers();
    } catch (e: any) { alert(e.message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿CONFIRMAS BORRAR ESTE USUARIO?')) return;
    try { await deleteUser(id); loadUsers(); } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="p-8 animate-in fade-in">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h2 className="text-3xl font-black tracking-tighter uppercase text-slate-900">Gestión de Personal</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Colaboradores registrados</p>
        </div>
        <button onClick={() => { setEditingUser(null); setShowModal(true); }} className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-3 shadow-xl hover:bg-slate-800 transition-all">
          <Plus size={18} /> Nuevo Colaborador
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {users.map(u => (
          <div key={u.id} className="bg-white border border-slate-100 rounded-[32px] p-6 shadow-sm hover:shadow-xl transition-all group">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-slate-50 overflow-hidden border shadow-sm flex items-center justify-center">
                  {u.referenceImage ? <img src={u.referenceImage} className="w-full h-full object-cover" /> : <UserIcon className="text-slate-200" size={24} />}
                </div>
                <div>
                  <h4 className="font-black text-sm text-slate-900 uppercase leading-none">{u.name}</h4>
                  <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Lgj: {u.legajo || '---'}</p>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase ${u.isActive ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                {u.isActive ? 'Activo' : 'Inactivo'}
              </span>
            </div>
            
            <div className="space-y-4 mb-6">
              <div className="flex items-center gap-3 text-slate-500">
                <Briefcase size={14} />
                <span className="text-[10px] font-bold uppercase tracking-widest">{u.role}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-500">
                <Shirt size={14} />
                <span className="text-[10px] font-bold uppercase tracking-widest truncate">{u.dressCode || 'Sin especificar'}</span>
              </div>
            </div>

            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
              <button onClick={() => { setEditingUser(u); setShowModal(true); }} className="flex-1 py-3 bg-slate-50 text-slate-900 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-100 flex items-center justify-center gap-2">
                <Pencil size={14} /> Editar
              </button>
              <button onClick={() => handleDelete(u.id)} className="p-3 text-rose-200 hover:text-rose-500 transition-colors">
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showModal && <UserModal user={editingUser} onClose={() => setShowModal(false)} onSave={handleSave} />}
    </div>
  );
};

// --- UserModal ---
const UserModal = ({ user, onClose, onSave }: { user: User | null, onClose: () => void, onSave: (u: User) => void }) => {
  const [formData, setFormData] = useState<User>(user || {
    id: '', dni: '', password: '', name: '', role: 'Mozo', legajo: '', dressCode: '', referenceImage: null, schedule: [], isActive: true
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setFormData({ ...formData, referenceImage: reader.result as string });
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white rounded-[40px] shadow-2xl p-8 md:p-12 animate-in zoom-in-95 my-8">
        <div className="flex items-center justify-between mb-10">
          <h3 className="text-2xl font-black uppercase tracking-tighter">{user ? 'Editar Colaborador' : 'Nuevo Colaborador'}</h3>
          <button onClick={onClose} className="p-3 text-slate-300 hover:text-slate-900"><X size={24} /></button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="md:col-span-2 flex justify-center mb-4">
            <div className="relative group">
              <div className="w-32 h-32 rounded-[32px] bg-slate-50 border-4 border-slate-100 flex items-center justify-center overflow-hidden shadow-inner">
                {formData.referenceImage ? (
                  <img src={formData.referenceImage} className="w-full h-full object-cover" />
                ) : (
                  <UserIcon className="text-slate-200" size={48} />
                )}
              </div>
              <label className="absolute inset-0 flex items-center justify-center bg-slate-900/40 text-white opacity-0 group-hover:opacity-100 cursor-pointer rounded-[32px] transition-all backdrop-blur-sm">
                <Upload size={24} />
                <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre Completo</label>
            <input 
              type="text" 
              value={formData.name} 
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-slate-50 border-2 border-slate-50 p-4 rounded-2xl font-bold text-xs outline-none focus:border-orange-500 focus:bg-white transition-all shadow-sm"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">DNI</label>
            <input 
              type="text" 
              value={formData.dni} 
              onChange={e => setFormData({ ...formData, dni: e.target.value })}
              className="w-full bg-slate-50 border-2 border-slate-50 p-4 rounded-2xl font-bold text-xs outline-none focus:border-orange-500 focus:bg-white transition-all shadow-sm"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Legajo</label>
            <input 
              type="text" 
              value={formData.legajo} 
              onChange={e => setFormData({ ...formData, legajo: e.target.value })}
              className="w-full bg-slate-50 border-2 border-slate-50 p-4 rounded-2xl font-bold text-xs outline-none focus:border-orange-500 focus:bg-white transition-all shadow-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Contraseña</label>
            <input 
              type="password" 
              value={formData.password} 
              onChange={e => setFormData({ ...formData, password: e.target.value })}
              className="w-full bg-slate-50 border-2 border-slate-50 p-4 rounded-2xl font-bold text-xs outline-none focus:border-orange-500 focus:bg-white transition-all shadow-sm"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Rol / Puesto</label>
            <select 
              value={formData.role} 
              onChange={e => setFormData({ ...formData, role: e.target.value })}
              className="w-full bg-slate-50 border-2 border-slate-50 p-4 rounded-2xl font-bold text-xs outline-none focus:border-orange-500 focus:bg-white transition-all shadow-sm appearance-none"
            >
              {DEFAULT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Código de Vestimenta</label>
            <input 
              type="text" 
              value={formData.dressCode} 
              onChange={e => setFormData({ ...formData, dressCode: e.target.value })}
              placeholder="Ej: Camisa negra, pantalón oscuro"
              className="w-full bg-slate-50 border-2 border-slate-50 p-4 rounded-2xl font-bold text-xs outline-none focus:border-orange-500 focus:bg-white transition-all shadow-sm"
            />
          </div>

          <div className="md:col-span-2 flex items-center gap-4 bg-slate-50 p-6 rounded-[24px]">
             <input 
               type="checkbox" 
               checked={formData.isActive} 
               onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
               className="w-6 h-6 accent-orange-600 rounded-lg cursor-pointer"
               id="userActive"
             />
             <label htmlFor="userActive" className="text-xs font-black uppercase tracking-widest cursor-pointer">Colaborador Activo</label>
          </div>

          <div className="md:col-span-2 flex gap-4 pt-4">
            <button type="button" onClick={onClose} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all">Cancelar</button>
            <button type="submit" className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl hover:bg-slate-800 transition-all">Guardar Colaborador</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- LocationsDashboard ---
const LocationsDashboard = () => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingLoc, setEditingLoc] = useState<Location | null>(null);

  useEffect(() => { loadLocations(); }, []);

  const loadLocations = async () => {
    const data = await fetchLocations();
    setLocations(data);
  };

  const handleSave = async (loc: Location) => {
    try {
      await saveLocation(loc);
      setShowModal(false);
      loadLocations();
    } catch (e: any) { alert(e.message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿CONFIRMAS BORRAR ESTA SEDE?')) return;
    try { await deleteLocation(id); loadLocations(); } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="p-8 animate-in fade-in">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h2 className="text-3xl font-black tracking-tighter uppercase text-slate-900">Gestión de Sedes</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Ubicaciones habilitadas</p>
        </div>
        <button onClick={() => { setEditingLoc(null); setShowModal(true); }} className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-3 shadow-xl hover:bg-slate-800 transition-all">
          <Plus size={18} /> Nueva Sede
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {locations.map(l => (
          <div key={l.id} className="bg-white border border-slate-100 rounded-[32px] p-8 shadow-sm hover:shadow-xl transition-all group">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-600">
                <MapPin size={24} />
              </div>
              <h4 className="font-black text-lg text-slate-900 uppercase tracking-tight truncate flex-1">{l.name}</h4>
            </div>

            <div className="space-y-4 mb-8">
               <div className="flex items-start gap-3">
                  <Navigation size={14} className="text-slate-300 mt-1" />
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{l.address}, {l.city}</p>
               </div>
               <div className="flex items-center gap-3">
                  <Target size={14} className="text-slate-300" />
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Radio: {l.radiusMeters}m</p>
               </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => { setEditingLoc(l); setShowModal(true); }} className="flex-1 py-3 bg-slate-50 text-slate-900 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-100 flex items-center justify-center gap-2">
                <Pencil size={14} /> Editar
              </button>
              <button onClick={() => handleDelete(l.id)} className="p-3 text-rose-200 hover:text-rose-500 transition-colors">
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showModal && <LocationModal location={editingLoc} onClose={() => setShowModal(false)} onSave={handleSave} />}
    </div>
  );
};

// --- LocationModal ---
const LocationModal = ({ location, onClose, onSave }: { location: Location | null, onClose: () => void, onSave: (l: Location) => void }) => {
  const [formData, setFormData] = useState<Location>(location || {
    id: '', name: '', address: '', city: '', lat: -34.6037, lng: -58.3816, radiusMeters: 100
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const setTerminalLocation = () => {
    localStorage.setItem('upfest_terminal_location_id', formData.id);
    alert('Sede asignada como terminal local.');
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-[40px] shadow-2xl p-8 md:p-12 animate-in zoom-in-95">
        <div className="flex items-center justify-between mb-10">
          <h3 className="text-2xl font-black uppercase tracking-tighter">{location ? 'Editar Sede' : 'Nueva Sede'}</h3>
          <button onClick={onClose} className="p-3 text-slate-300 hover:text-slate-900"><X size={24} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre de la Sede</label>
            <input 
              type="text" 
              value={formData.name} 
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-slate-50 border-2 border-slate-50 p-4 rounded-2xl font-bold text-xs outline-none focus:border-orange-500 focus:bg-white transition-all shadow-sm"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Dirección</label>
                <input 
                  type="text" 
                  value={formData.address} 
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                  className="w-full bg-slate-50 border-2 border-slate-50 p-4 rounded-2xl font-bold text-xs outline-none focus:border-orange-500 shadow-sm"
                  required
                />
             </div>
             <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ciudad</label>
                <input 
                  type="text" 
                  value={formData.city} 
                  onChange={e => setFormData({ ...formData, city: e.target.value })}
                  className="w-full bg-slate-50 border-2 border-slate-50 p-4 rounded-2xl font-bold text-xs outline-none focus:border-orange-500 shadow-sm"
                  required
                />
             </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Latitud</label>
                <input 
                  type="number" step="any"
                  value={formData.lat} 
                  onChange={e => setFormData({ ...formData, lat: parseFloat(e.target.value) })}
                  className="w-full bg-slate-50 border-2 border-slate-50 p-4 rounded-2xl font-bold text-xs outline-none focus:border-orange-500 shadow-sm"
                  required
                />
             </div>
             <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Longitud</label>
                <input 
                  type="number" step="any"
                  value={formData.lng} 
                  onChange={e => setFormData({ ...formData, lng: parseFloat(e.target.value) })}
                  className="w-full bg-slate-50 border-2 border-slate-50 p-4 rounded-2xl font-bold text-xs outline-none focus:border-orange-500 shadow-sm"
                  required
                />
             </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Radio Geofence (metros)</label>
            <input 
              type="number" 
              value={formData.radiusMeters} 
              onChange={e => setFormData({ ...formData, radiusMeters: parseInt(e.target.value) })}
              className="w-full bg-slate-50 border-2 border-slate-50 p-4 rounded-2xl font-bold text-xs outline-none focus:border-orange-500 shadow-sm"
              required
            />
          </div>

          {location && (
            <button type="button" onClick={setTerminalLocation} className="w-full py-4 border-2 border-orange-100 text-orange-600 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-orange-50 transition-all flex items-center justify-center gap-3 mb-2">
              <Monitor size={18} /> Usar como Sede Terminal
            </button>
          )}

          <div className="flex gap-4 pt-4">
            <button type="button" onClick={onClose} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all">Cancelar</button>
            <button type="submit" className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl hover:bg-slate-800 transition-all">Guardar Sede</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('clock');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  useEffect(() => { fetchCompanyLogo().then(setLogoUrl).catch(() => {}); }, []);
  if (!currentUser) return <LoginView onLogin={(u: User) => { setCurrentUser(u); setActiveTab('clock'); }} logoUrl={logoUrl} />;
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row overflow-hidden text-slate-900">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} currentUser={currentUser} onLogout={() => setCurrentUser(null)} logoUrl={logoUrl} isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen} />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="md:hidden bg-white/80 backdrop-blur-md border-b px-6 py-4 flex items-center justify-between z-50 sticky top-0">
          <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 -ml-2 text-slate-600"><Menu size={24}/></button>
          <span className="font-black text-lg tracking-tighter">UPFEST</span>
          <div className="w-10"></div> 
        </header>
        <main className="flex-1 overflow-y-auto scroll-smooth">
          <div className="pb-20 md:pb-0">
            {activeTab === 'clock' && <ClockView user={currentUser} onLogout={() => setCurrentUser(null)} />}
            {activeTab === 'admin' && <AdminDashboard />}
            {activeTab === 'locations' && <LocationsDashboard />}
          </div>
        </main>
      </div>
    </div>
  );
}
