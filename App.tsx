
import React, { useState, useEffect, useRef } from 'react';
import { 
  Role, Location, User, LogEntry, WorkSchedule, Incident, ValidationResult, DEFAULT_ROLES, DAYS_OF_WEEK
} from './types';
import { 
  getCurrentPosition, calculateDistance, isWithinSchedule, 
  fetchUsers, fetchLocations, fetchLogs, fetchTodayLogs, fetchLogsByDateRange, addLog, saveUser, deleteUser,
  authenticateUser, saveLocation, deleteLocation, fetchCompanyLogo, saveCompanyLogo,
  fetchLastLog, updateLog, deleteLog
} from './services/utils';
import { analyzeCheckIn } from './services/geminiService';
import { 
  Camera, User as UserIcon, Shield, Clock, 
  LogOut, CheckCircle, XCircle, AlertTriangle, Plus, Save, Lock, Hash, Upload, Trash2, ImageIcon, Pencil, X, RotateCcw, FileText, Users, Building, MapPin, Monitor, Maximize2, Laptop, FileUp, Key, Bell, BellRing, Wallet, MapPinned, RefreshCw, UserCheck, Shirt, Download, FileSpreadsheet, Menu, ArrowRight, Calendar, Briefcase, Filter, Search
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
  
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [isFiltering, setIsFiltering] = useState(false);
  const [activeQuickFilter, setActiveQuickFilter] = useState<string | null>(null);
  
  const defaultWebhook = 'https://script.google.com/macros/s/AKfycbxFfuiW2oOkPpao2bL0G45mxZR5hZ5-4T2Ko-f04oFPSwEaLaREHyAg7iiEXdCBl8dY/exec';
  const [gsheetUrl, setGsheetUrl] = useState(localStorage.getItem('upfest_gsheet_webhook') || defaultWebhook);
  const [successAction, setSuccessAction] = useState<{ type: string, countdown: number } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const loadData = (showLoading = false) => {
    if (showLoading) setIsFiltering(true);
    const deviceLocId = localStorage.getItem('upfest_terminal_location_id');

    const logsPromise = (filterStartDate && filterEndDate) 
      ? fetchLogsByDateRange(new Date(filterStartDate + 'T00:00:00'), new Date(filterEndDate + 'T23:59:59'))
      : fetchLogs();

    Promise.all([
      fetchLocations(),
      logsPromise,
      fetchUsers()
    ]).then(([allLocs, logs, users]) => {
      setLocations(allLocs);
      setAllUsers(users);
      if (user.role === 'Admin') setAdminLogs(logs);
      setUserTodayLogs(logs.filter(l => l.userId === user.id && new Date(l.timestamp).toDateString() === new Date().toDateString()));
      if (deviceLocId) setDeviceLocation(allLocs.find(l => l.id === deviceLocId) || null);
    }).catch(err => {
      console.error("Error al cargar datos del monitor:", err);
    }).finally(() => {
      if (showLoading) setIsFiltering(false);
    });
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
        if (!filterStartDate && !filterEndDate) loadData();
    }, 45000);
    return () => clearInterval(interval);
  }, [user.id, filterStartDate, filterEndDate]);

  // --- Quick Date Handlers ---
  const applyQuickFilter = (type: 'today' | 'yesterday' | 'week' | 'month') => {
    const today = new Date();
    const start = new Date();
    const end = new Date();
    
    setActiveQuickFilter(type);

    switch(type) {
      case 'today':
        break;
      case 'yesterday':
        start.setDate(today.getDate() - 1);
        end.setDate(today.getDate() - 1);
        break;
      case 'week':
        start.setDate(today.getDate() - 7);
        break;
      case 'month':
        start.setDate(1);
        break;
    }

    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    setFilterStartDate(formatDate(start));
    setFilterEndDate(formatDate(end));
    
    // Forzamos la carga inmediata
    setTimeout(() => loadData(true), 50);
  };

  const handleApplyFilter = () => {
    if (!filterStartDate || !filterEndDate) {
        alert("Por favor selecciona ambas fechas.");
        return;
    }
    setActiveQuickFilter(null);
    loadData(true);
  };

  const handleClearFilter = () => {
    setFilterStartDate('');
    setFilterEndDate('');
    setActiveQuickFilter(null);
    setTimeout(() => loadData(true), 100);
  };

  const handleExportExcel = () => {
    if (adminLogs.length === 0) return alert("No hay datos para exportar.");
    const dataToExport = adminLogs.map(log => {
      const staffUser = allUsers.find(u => u.id === log.userId);
      const logDate = new Date(log.timestamp);
      return {
        'ID': log.id,
        'DNI': staffUser?.dni || 'N/A',
        'NOMBRE': log.userName,
        'FECHA': logDate.toLocaleDateString('es-AR'),
        'HORA': logDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
        'TIPO': log.type === 'CHECK_IN' ? 'INGRESO' : 'EGRESO',
        'VALIDACION ROSTRO': log.identityStatus === 'MATCH' ? 'Válido' : 'Fallo',
        'VALIDACION VESTIMENTA': log.dressCodeStatus === 'PASS' ? 'Correcto' : 'Error',
        'DESCRIPCION IA': log.aiFeedback
      };
    });
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fichadas");
    XLSX.writeFile(wb, `UpFest_Reporte_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  useEffect(() => {
    let active = true;
    async function startCamera() {
      if (cameraActive) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } } 
          });
          if (active) {
            streamRef.current = stream;
            if (videoRef.current) videoRef.current.srcObject = stream;
          } else {
            stream.getTracks().forEach(t => t.stop());
          }
        } catch (err) {
          console.error("Camera error:", err);
          if (active) { setCameraActive(false); }
        }
      } else { stopCamera(); }
    }
    startCamera();
    return () => { active = false; stopCamera(); };
  }, [cameraActive]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => {
    let interval: number;
    if (successAction && successAction.countdown > 0) {
      interval = window.setInterval(() => {
        setSuccessAction(prev => prev ? { ...prev, countdown: prev.countdown - 1 } : null);
      }, 1000);
    } else if (successAction && successAction.countdown === 0) {
      onLogout();
    }
    return () => clearInterval(interval);
  }, [successAction, onLogout]);

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
      const iaResult = await analyzeCheckIn(photo, user.dressCode, user.referenceImage);
      const lastLog = await fetchLastLog(user.id);
      const type = (!lastLog || lastLog.type === 'CHECK_OUT') ? 'CHECK_IN' : 'CHECK_OUT';
      const newLog: LogEntry = {
        id: '',
        userId: user.id,
        userName: user.name,
        legajo: user.legajo,
        timestamp: new Date().toISOString(),
        type,
        locationId: deviceLocation?.id || 'manual',
        locationName: deviceLocation?.name || 'Manual',
        locationStatus: locStatus,
        dressCodeStatus: iaResult.dressCodeMatches ? 'PASS' : 'FAIL',
        identityStatus: iaResult.identityMatch ? 'MATCH' : 'NO_MATCH',
        photoEvidence: photo,
        aiFeedback: iaResult.description,
        scheduleStatus: isWithinSchedule(user.schedule) ? 'ON_TIME' : 'OFF_SCHEDULE'
      };
      await addLog(newLog);
      setPhoto(null);
      loadData();
      setSuccessAction({ type: type === 'CHECK_IN' ? 'INGRESO' : 'EGRESO', countdown: 7 });
    } catch (error: any) { alert("Error: " + error.message); } finally { setLoading(false); setLoadingMsg(''); }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        setPhoto(canvasRef.current.toDataURL('image/jpeg', 0.8));
        setCameraActive(false);
      }
    }
  };

  const handleDeleteLog = async (logId: string) => {
    if (!confirm('¿BORRAR FICHADA?')) return;
    setIsDeleting(logId);
    try { await deleteLog(logId); setAdminLogs(prev => prev.filter(l => l.id !== logId)); } 
    catch (e: any) { alert(e.message); } finally { setIsDeleting(null); }
  };

  if (user.role === 'Admin') {
    const incidentLogs = adminLogs.filter(l => l.dressCodeStatus === 'FAIL' || l.identityStatus === 'NO_MATCH');
    return (
      <div className="max-w-full mx-auto p-4 md:p-8 space-y-6 md:space-y-8 animate-in fade-in duration-500">
        <div className="bg-white rounded-[24px] md:rounded-[32px] p-5 md:p-10 border border-slate-200 shadow-sm overflow-hidden">
           <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-6">
              <div className="text-center md:text-left">
                <h3 className="text-xl md:text-2xl font-black text-slate-900 tracking-tighter uppercase flex items-center justify-center md:justify-start gap-3">
                  <Monitor className="text-orange-600" /> MONITOR DE PERSONAL
                </h3>
                <p className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest">En vivo - UpFest Control</p>
              </div>
              <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto justify-center">
                <button onClick={handleExportExcel} className="flex-1 md:flex-none px-4 md:px-6 py-3 md:py-4 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center gap-3 transition-all hover:bg-emerald-100">
                    <Download size={18}/><span className="text-[10px] font-black uppercase">Exportar Excel</span>
                </button>
                <button onClick={() => setShowAlerts(!showAlerts)} className={`flex-1 md:flex-none px-4 md:px-6 py-3 md:py-4 rounded-full border flex items-center justify-center gap-3 transition-all ${incidentLogs.length > 0 ? 'bg-red-50 border-red-200 text-red-600 shadow-lg shadow-red-100' : 'bg-slate-50 text-slate-400'}`}>
                    <Bell size={18} className={incidentLogs.length > 0 ? 'animate-bounce' : ''}/><span className="text-[10px] font-black uppercase">Alertas ({incidentLogs.length})</span>
                </button>
              </div>
           </div>

           {/* --- PANEL DE FILTROS RÁPIDOS Y CALENDARIO --- */}
           <div className="mb-8 p-6 bg-slate-50 rounded-[24px] border border-slate-100 space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mr-2">Filtros Rápidos:</span>
                {[
                    { id: 'today', label: 'Hoy', icon: Clock },
                    { id: 'yesterday', label: 'Ayer', icon: RotateCcw },
                    { id: 'week', label: '7 Días', icon: Calendar },
                    { id: 'month', label: 'Este Mes', icon: Briefcase }
                ].map(f => (
                    <button 
                        key={f.id} 
                        onClick={() => applyQuickFilter(f.id as any)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all border ${activeQuickFilter === f.id ? 'bg-orange-600 border-orange-600 text-white shadow-lg shadow-orange-200' : 'bg-white border-slate-200 text-slate-500 hover:border-orange-300'}`}
                    >
                        <f.icon size={12}/> {f.label}
                    </button>
                ))}
              </div>

              <div className="flex flex-col md:flex-row items-end gap-4 border-t pt-6">
                <div className="flex-1 w-full space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Calendar size={12}/> Fecha Inicio</label>
                    <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="w-full bg-white border border-slate-200 p-3 rounded-xl font-bold text-xs outline-none focus:border-orange-500 transition-colors cursor-pointer" />
                </div>
                <div className="flex-1 w-full space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Calendar size={12}/> Fecha Fin</label>
                    <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="w-full bg-white border border-slate-200 p-3 rounded-xl font-bold text-xs outline-none focus:border-orange-500 transition-colors cursor-pointer" />
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <button onClick={handleApplyFilter} disabled={isFiltering} className="flex-1 md:flex-none bg-slate-900 text-white px-6 py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-800 disabled:opacity-50">
                        {isFiltering ? <RefreshCw className="animate-spin" size={14}/> : <Search size={14}/>} Filtrar Rango
                    </button>
                    {(filterStartDate || filterEndDate) && (
                        <button onClick={handleClearFilter} className="p-3.5 bg-white border border-slate-200 text-slate-400 rounded-xl hover:text-rose-500 transition-colors">
                            <RotateCcw size={18}/>
                        </button>
                    )}
                </div>
              </div>
           </div>

           <div className="relative group">
              <div className="overflow-x-auto bg-slate-50/50 rounded-[16px] md:rounded-[24px] border border-slate-100">
                  <table className="w-full text-left min-w-[1100px] border-collapse">
                    <thead>
                      <tr className="bg-[#0f172a] text-white">
                        <th className="p-4 md:p-6 text-[9px] md:text-[10px] font-black uppercase text-center">Foto</th>
                        <th className="p-4 md:p-6 text-[9px] md:text-[10px] font-black uppercase">Colaborador</th>
                        <th className="p-4 md:p-6 text-[9px] md:text-[10px] font-black uppercase text-center">Fecha / Hora</th>
                        <th className="p-4 md:p-6 text-[9px] md:text-[10px] font-black uppercase text-center">Tipo</th>
                        <th className="p-4 md:p-6 text-[9px] md:text-[10px] font-black uppercase text-center border-l border-white/10">Rostro</th>
                        <th className="p-4 md:p-6 text-[9px] md:text-[10px] font-black uppercase text-center">Vestimenta</th>
                        <th className="p-4 md:p-6 text-[9px] md:text-[10px] font-black uppercase">Descripción IA</th>
                        <th className="p-4 md:p-6 text-[9px] md:text-[10px] font-black uppercase text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {adminLogs.length === 0 ? (
                        <tr><td colSpan={8} className="p-20 text-center text-slate-300 font-black uppercase tracking-widest">No hay registros</td></tr>
                      ) : adminLogs.map(log => (
                        <tr key={log.id} className="hover:bg-white transition-colors group">
                          <td className="p-4 md:p-6 text-center">
                            <div onClick={() => log.photoEvidence && setZoomedImage(log.photoEvidence)} className="w-12 h-12 md:w-14 md:h-14 mx-auto rounded-lg md:rounded-xl overflow-hidden border cursor-zoom-in shadow-sm transition-all">
                              {log.photoEvidence ? <img src={log.photoEvidence} className="w-full h-full object-cover" /> : <UserIcon className="m-auto mt-4 text-slate-300" />}
                            </div>
                          </td>
                          <td className="p-4 md:p-6">
                            <span className="block font-black text-slate-900 text-xs md:text-sm uppercase">{log.userName}</span>
                            <span className="text-[8px] md:text-[9px] text-slate-400 font-bold uppercase tracking-wider">Lgj: {log.legajo}</span>
                          </td>
                          <td className="p-4 md:p-6 text-center">
                              <span className="text-[10px] md:text-xs font-black text-slate-900 font-mono uppercase">{new Date(log.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                              <span className="block text-[8px] text-slate-400 uppercase font-bold">{getFormattedDate(log.timestamp)}</span>
                          </td>
                          <td className="p-4 md:p-6 text-center">
                            <span className={`px-3 md:px-4 py-1.5 md:py-2 rounded-full text-[8px] md:text-[9px] font-black uppercase border ${log.type === 'CHECK_IN' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                              {log.type === 'CHECK_IN' ? 'INGRESO' : 'EGRESO'}
                            </span>
                          </td>
                          <td className="p-4 md:p-6 text-center border-l border-slate-100">
                            <span className={`text-[8px] font-black uppercase ${log.identityStatus === 'MATCH' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {log.identityStatus === 'MATCH' ? 'Válido' : 'Fallo'}
                            </span>
                          </td>
                          <td className="p-4 md:p-6 text-center">
                            <span className={`text-[8px] font-black uppercase ${log.dressCodeStatus === 'PASS' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {log.dressCodeStatus === 'PASS' ? 'Correcto' : 'Error'}
                            </span>
                          </td>
                          <td className="p-4 md:p-6 max-w-xs">
                            <p className="text-[9px] md:text-[10px] italic text-slate-500 line-clamp-2 leading-relaxed">"{log.aiFeedback}"</p>
                          </td>
                          <td className="p-4 md:p-6 text-center">
                            <button disabled={isDeleting === log.id} onClick={() => handleDeleteLog(log.id)} className="p-2 text-slate-200 hover:text-red-500">
                                {isDeleting === log.id ? <RefreshCw className="animate-spin" size={16}/> : <Trash2 size={18}/>}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              </div>
           </div>
        </div>
        {zoomedImage && (<div className="fixed inset-0 z-[200] bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-8" onClick={() => setZoomedImage(null)}><img src={zoomedImage} className="max-w-full max-h-full rounded-2xl md:rounded-[40px] shadow-2xl border-4 border-white animate-in zoom-in-95" /></div>)}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 relative">
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
          <div className="aspect-square rounded-[32px] overflow-hidden bg-slate-900 mb-6 relative border-4 border-slate-100">
             {!cameraActive && !photo && (
               <button onClick={() => setCameraActive(true)} className="absolute inset-0 text-white font-black uppercase text-xs flex flex-col items-center justify-center gap-4 hover:bg-slate-800 transition-colors">
                 <div className="w-16 h-16 rounded-full bg-orange-600 flex items-center justify-center shadow-xl"><Camera size={28}/></div>
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
            {photo && !loading && <button onClick={handleClockAction} className="w-full py-5 bg-slate-900 text-white rounded-[24px] font-black uppercase tracking-widest shadow-xl flex items-center justify-center gap-2">Confirmar Fichada <ArrowRight size={18}/></button>}
            {photo && !loading && <button onClick={() => { setPhoto(null); setCameraActive(true); }} className="w-full py-4 bg-slate-100 text-slate-500 rounded-[20px] font-black uppercase text-[10px] tracking-widest">Tomar otra foto</button>}
          </div>
        </div>

        <div className="space-y-6 flex flex-col">
          <div className="bg-white rounded-[32px] p-8 border shadow-sm">
            <h3 className="font-black text-[10px] uppercase text-slate-400 tracking-widest mb-4">Perfil</h3>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 overflow-hidden border shrink-0">
                {user.referenceImage ? <img src={user.referenceImage} className="w-full h-full object-cover" /> : <UserIcon className="m-auto mt-4 text-slate-300" />}
              </div>
              <div>
                <h4 className="font-black text-lg text-slate-900 uppercase leading-none">{user.name}</h4>
                <p className="text-[9px] font-bold text-slate-500 mt-1 uppercase">{user.role}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-[32px] p-8 border shadow-sm flex-1 overflow-hidden min-h-[300px]">
             <h3 className="font-black text-[10px] uppercase text-slate-400 tracking-widest mb-6 flex justify-between">
                <span>Movimientos hoy</span>
                <span className="text-slate-900">{new Date().toLocaleDateString('es-AR', {day:'2-digit', month:'short'})}</span>
             </h3>
             <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {userTodayLogs.length === 0 ? (
                  <div className="py-10 text-center border-2 border-dashed rounded-[20px] border-slate-100 text-slate-300 uppercase text-[9px] font-black">Sin movimientos</div>
                ) : userTodayLogs.map(l => (
                  <div key={l.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${l.type === 'CHECK_IN' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-600'}`}>
                            {l.type === 'CHECK_IN' ? <UserCheck size={16}/> : <LogOut size={16}/>}
                        </div>
                        <div>
                            <span className="block font-black text-xs uppercase">{l.type === 'CHECK_IN' ? 'Ingreso' : 'Egreso'}</span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase leading-none">{l.locationName}</span>
                        </div>
                    </div>
                    <span className="font-mono font-black text-sm">{new Date(l.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
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

// --- Personal Dashboard ---
const AdminDashboard = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<Location[]>([]);
  const [formData, setFormData] = useState<Partial<User>>({});
  const [formSaving, setFormSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => { 
    setLoading(true); 
    try { 
      const [u, l] = await Promise.all([fetchUsers(), fetchLocations()]); 
      setUsers(u); 
      setLocations(l); 
    } catch (err) { console.error("Error al cargar nómina:", err); } 
    finally { setLoading(false); } 
  };

  useEffect(() => { load(); }, []);

  useEffect(() => { 
    if (editingUser) setFormData({ ...editingUser, schedule: editingUser.schedule || [] }); 
    else setFormData({ role: 'Mozo', schedule: [], assignedLocations: [], password: '1234' }); 
  }, [editingUser, isCreating]);

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault(); 
    if (!formData.name || !formData.dni) return alert("Nombre y DNI obligatorios");
    setFormSaving(true); 
    try { 
      await saveUser(formData as User); 
      setEditingUser(null); 
      setIsCreating(false); 
      load(); 
    } catch (err: any) { alert("Error al guardar: " + err.message); } 
    finally { setFormSaving(false); }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setFormData({ ...formData, referenceImage: reader.result as string });
      reader.readAsDataURL(file);
    }
  };

  const addSchedule = () => {
    const newSchedule: WorkSchedule = { startDay: 'Lunes', startTime: '09:00', endDay: 'Lunes', endTime: '18:00' };
    setFormData({ ...formData, schedule: [...(formData.schedule || []), newSchedule] });
  };

  const removeSchedule = (index: number) => {
    const newSchedules = [...(formData.schedule || [])];
    newSchedules.splice(index, 1);
    setFormData({ ...formData, schedule: newSchedules });
  };

  const updateSchedule = (index: number, field: keyof WorkSchedule, value: string) => {
    const newSchedules = [...(formData.schedule || [])];
    newSchedules[index] = { ...newSchedules[index], [field]: value };
    setFormData({ ...formData, schedule: newSchedules });
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div className="text-center md:text-left">
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Personal</h1>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Nómina UpFest Control</p>
        </div>
        <button onClick={() => setIsCreating(true)} className="w-full md:w-auto bg-slate-900 text-white px-8 py-4 rounded-2xl flex items-center justify-center gap-3 shadow-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-colors">
          <Plus size={18} /> Nuevo Colaborador
        </button>
      </div>
      
      <div className="bg-white rounded-[32px] border overflow-hidden shadow-sm">
         <div className="overflow-x-auto"><table className="w-full text-left border-collapse">
           <thead><tr className="bg-slate-50 border-b"><th className="p-6 text-[10px] font-black uppercase">Colaborador</th><th className="p-6 text-[10px] font-black uppercase">DNI</th><th className="p-6 text-[10px] font-black uppercase">Rol</th><th className="p-6 text-right">Acciones</th></tr></thead>
           <tbody className="divide-y">
             {users.map(u => (
               <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                 <td className="p-6 flex items-center gap-4"><div className="w-10 h-10 rounded-xl bg-slate-100 overflow-hidden border shrink-0">{u.referenceImage && <img src={u.referenceImage} className="w-full h-full object-cover" />}</div><span className="font-black text-slate-800 uppercase text-sm">{u.name}</span></td>
                 <td className="p-6 text-xs font-bold text-slate-500 font-mono">{u.dni}</td>
                 <td className="p-6 text-[10px] font-black uppercase text-slate-700">{u.role}</td>
                 <td className="p-6 text-right"><button onClick={() => setEditingUser(u)} className="p-3 text-slate-300 hover:text-orange-600 transition-colors"><Pencil size={18}/></button></td>
               </tr>
             ))}
           </tbody>
         </table></div>
      </div>

      {(isCreating || editingUser) && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-2 md:p-4">
          <div className="bg-white rounded-[48px] w-full max-w-5xl shadow-2xl overflow-y-auto max-h-[95vh] relative animate-in zoom-in-95 duration-300">
            <button type="button" onClick={() => { setEditingUser(null); setIsCreating(false); }} className="absolute top-8 right-8 p-3 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-400 transition-colors z-10"><X size={20}/></button>
            <form onSubmit={handleSaveUser} className="p-12 space-y-12">
              <div className="border-b pb-6">
                <h3 className="font-black text-4xl text-slate-900 uppercase tracking-tighter leading-none">{editingUser ? 'EDITAR FICHA' : 'NUEVO COLABORADOR'}</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 italic">SISTEMA RRHH - UPFEST</p>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-12">
                <div className="flex flex-col items-center gap-6">
                    <div className="aspect-[4/5] w-full bg-slate-50 rounded-[32px] border-4 border-slate-100 relative overflow-hidden group">
                       {formData.referenceImage ? <img src={formData.referenceImage} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-200"><ImageIcon size={48}/></div>}
                       <button type="button" onClick={() => fileInputRef.current?.click()} className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-black text-xs uppercase gap-2 backdrop-blur-sm"><Upload size={18}/> Cambiar</button>
                    </div>
                    <input type="file" ref={fileInputRef} onChange={handleImageChange} className="hidden" accept="image/*" />
                </div>
                <div className="xl:col-span-2 space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="col-span-full space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400">Nombre Completo</label>
                      <input type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-5 bg-slate-50 rounded-[20px] font-black text-slate-900 outline-none uppercase text-sm" required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400">DNI</label>
                      <input type="text" value={formData.dni || ''} onChange={e => setFormData({...formData, dni: e.target.value})} className="w-full p-5 bg-slate-50 rounded-[20px] font-black text-slate-900 outline-none text-sm" required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400">Rol</label>
                      <select value={formData.role || 'Mozo'} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full p-5 bg-slate-50 rounded-[20px] font-black text-slate-900 outline-none appearance-none text-sm">
                        {DEFAULT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">VESTIMENTA REQUERIDA</label>
                    <textarea value={formData.dressCode || ''} onChange={e => setFormData({...formData, dressCode: e.target.value})} className="w-full p-6 bg-slate-50 rounded-[28px] border-none font-black text-slate-900 h-32 outline-none text-sm" placeholder="Ej: Remera blanca con logo, pantalón negro..." />
                  </div>
                </div>
              </div>
              <div className="flex flex-col md:flex-row gap-3 pt-6 border-t">
                <button type="button" onClick={() => { setEditingUser(null); setIsCreating(false); }} className="flex-1 py-6 bg-white border border-slate-200 text-slate-400 rounded-[28px] font-black uppercase tracking-widest text-xs">CANCELAR</button>
                <button type="submit" disabled={formSaving} className="flex-[2] py-6 bg-slate-900 text-white rounded-[28px] font-black uppercase tracking-widest shadow-2xl flex items-center justify-center gap-3 text-xs transition-all hover:scale-[1.01]">
                  {formSaving ? <RefreshCw className="animate-spin"/> : 'GUARDAR FICHA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Salones Dashboard ---
const LocationsDashboard = () => {
    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentLocId, setCurrentLocId] = useState(localStorage.getItem('upfest_terminal_location_id'));
    const load = async () => { try { setLocations(await fetchLocations()); } finally { setLoading(false); } };
    useEffect(() => { load(); }, []);
    return (
        <div className="max-w-7xl mx-auto p-4 md:p-8 animate-in fade-in">
            <h1 className="text-3xl font-black text-slate-900 mb-8 uppercase tracking-tighter">Sedes / Salones</h1>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {loading ? <div className="col-span-full py-20 text-center text-slate-300 font-black uppercase">Cargando...</div> : locations.map(loc => (
                <div key={loc.id} className={`p-8 bg-white border rounded-[40px] shadow-sm transition-all ${currentLocId === loc.id ? 'border-orange-500 ring-8 ring-orange-50' : 'border-slate-100'}`}>
                  <div className={`w-16 h-16 rounded-[24px] flex items-center justify-center mb-6 ${currentLocId === loc.id ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-400'}`}><Building size={24}/></div>
                  <h3 className="font-black text-2xl text-slate-900 uppercase tracking-tighter mb-2">{loc.name}</h3>
                  <p className="text-xs font-bold text-slate-500 mb-8"><MapPin size={14} className="inline mr-2"/> {loc.address}</p>
                  <button onClick={() => { localStorage.setItem('upfest_terminal_location_id', loc.id); setCurrentLocId(loc.id); alert('Sede vinculada'); }} className={`w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest ${currentLocId === loc.id ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-900 text-white'}`}>
                    {currentLocId === loc.id ? 'VINCULADA' : 'VINCULAR TERMINAL'}
                  </button>
                </div>
              ))}
            </div>
        </div>
    );
};

// --- Sidebar y Layout ---
const Sidebar = ({ activeTab, setActiveTab, currentUser, onLogout, logoUrl, isMobileMenuOpen, setIsMobileMenuOpen }: any) => {
  const NavButton = ({ tab, icon: Icon, label }: any) => (
    <button onClick={() => { setActiveTab(tab); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-4 px-6 py-4 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition ${activeTab === tab ? 'bg-orange-50 text-orange-700' : 'text-slate-400 hover:bg-slate-50'}`}>
      <Icon size={20}/> {label}
    </button>
  );
  return (
    <>
      {isMobileMenuOpen && <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[90] md:hidden" onClick={() => setIsMobileMenuOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-[100] w-72 bg-white border-r border-slate-200 transform transition-transform duration-300 md:translate-x-0 md:static h-full flex flex-col ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-10 border-b flex flex-col items-center">
          {logoUrl ? <img src={logoUrl} className="h-16 mb-4 object-contain" /> : <div className="w-16 h-16 bg-slate-900 text-white rounded-[24px] flex items-center justify-center font-black text-2xl mb-4">UP</div>}
          <span className="font-black text-slate-900 tracking-tighter text-2xl">UPFEST</span>
        </div>
        <nav className="flex-1 p-8 space-y-2 overflow-y-auto">
          <NavButton tab="clock" icon={Clock} label={currentUser.role === 'Admin' ? 'Monitor' : 'Fichadas'} />
          {currentUser.role === 'Admin' && (
            <>
              <NavButton tab="admin" icon={Users} label="RRHH / Nómina" />
              <NavButton tab="locations" icon={Building} label="Salones / Sedes" />
            </>
          )}
        </nav>
        <div className="p-8 border-t space-y-2">
          {currentUser.role === 'Admin' && isAIStudio && (
            <button onClick={handleOpenApiKeyDialog} className="w-full flex items-center gap-4 px-6 py-3 rounded-[20px] text-[9px] font-black uppercase text-slate-400 border border-dashed hover:border-orange-500 transition-colors">
              <Key size={18} /> Llave AI
            </button>
          )}
          <button onClick={onLogout} className="w-full flex items-center gap-4 px-6 py-4 rounded-[20px] text-[10px] font-black uppercase text-red-400 hover:bg-red-50 transition-colors">
            <LogOut size={20} /> Salir
          </button>
        </div>
      </aside>
    </>
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

const LoginView = ({ onLogin, logoUrl }: { onLogin: (u: User) => void, logoUrl: string | null }) => {
  const [dni, setDni] = useState(''); 
  const [password, setPassword] = useState(''); 
  const [error, setError] = useState(''); 
  const [loading, setLoading] = useState(false);
  const handleLogin = async (e: React.FormEvent) => { 
    e.preventDefault(); 
    setLoading(true); 
    try { 
      const user = await authenticateUser(dni, password); 
      if (user) onLogin(user); 
      else setError('DNI O CLAVE INCORRECTO'); 
    } catch (err) { setError('ERROR DE CONEXIÓN'); } 
    finally { setLoading(false); } 
  };
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-sm bg-white rounded-[48px] shadow-2xl p-14 border relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-slate-900"></div>
        <div className="text-center">
          {logoUrl ? <img src={logoUrl} className="h-20 mx-auto mb-8 object-contain" /> : <div className="w-24 h-24 bg-slate-900 rounded-[32px] flex items-center justify-center mx-auto mb-8 text-white font-black text-4xl shadow-2xl">UP</div>}
          <h2 className="text-3xl font-black mb-2 uppercase tracking-tighter text-slate-800">UPFEST</h2>
          <p className="text-slate-400 font-black text-[10px] uppercase tracking-widest">CONTROL BIOMÉTRICO</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-6 mt-12">
          <input type="text" value={dni} onChange={e => setDni(e.target.value)} className="w-full px-8 py-5 border border-slate-200 rounded-[20px] font-bold outline-none focus:ring-4 focus:ring-blue-500/5 transition-all bg-slate-50/50 text-slate-900" placeholder="DNI" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-8 py-5 border border-slate-200 rounded-[20px] font-bold outline-none focus:ring-4 focus:ring-blue-500/5 transition-all bg-slate-50/50 text-slate-900" placeholder="CLAVE" />
          {error && <div className="text-red-500 text-[10px] font-black text-center uppercase">{error}</div>}
          <button type="submit" disabled={loading} className="w-full bg-slate-900 text-white font-black py-5 rounded-[20px] shadow-xl hover:bg-slate-800 transition-all disabled:opacity-50 text-sm uppercase tracking-widest">
            {loading ? 'CONECTANDO...' : 'INGRESAR'}
          </button>
        </form>
      </div>
    </div>
  );
};
