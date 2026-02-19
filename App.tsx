
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
  LogOut, CheckCircle, XCircle, AlertTriangle, Plus, Save, Lock, Hash, Upload, Trash2, ImageIcon, Pencil, X, RotateCcw, FileText, Users, Building, MapPin, Monitor, Maximize2, Laptop, FileUp, Key, Bell, BellRing, Wallet, MapPinned, RefreshCw, UserCheck, Shirt, Download, FileSpreadsheet, Menu, ArrowRight, Calendar, Briefcase, Filter, Search, XOctagon, Check, Navigation, Target, Activity, Eye, EyeOff, CalendarPlus, ChevronDown, TimerOff
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
    if (!dateStr) return '---';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      // Intento de parseo manual si viene en formato YYYY-MM-DD HH:mm:ss o similar
      const parts = dateStr.split(' ');
      if (parts.length > 0) return parts[0].split('-').reverse().join('/');
      return 'Fecha inválida';
    }
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
  const [cameraError, setCameraError] = useState<string | null>(null);
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
      
      const todayStr = new Date().toDateString();
      setUserTodayLogs(logs.filter(l => l.userId === user.id && new Date(l.timestamp).toDateString() === todayStr));
      
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
      const dateB = new Date(dateBStr.split('/').reverse().join('-')).getTime();
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
        setCameraError(null);
        try {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
             throw new Error("El navegador no soporta acceso a cámara o requiere conexión segura (HTTPS).");
          }
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
              facingMode: 'user', 
              width: { ideal: 1024 }, 
              height: { ideal: 1024 } 
            } 
          });
          if (active && videoRef.current) { 
            streamRef.current = stream; 
            videoRef.current.srcObject = stream; 
          }
          else { 
            stream.getTracks().forEach(t => t.stop()); 
          }
        } catch (err: any) { 
          console.error("Error al iniciar cámara:", err);
          if (active) {
            setCameraActive(false);
            setCameraError(err.message || "Error al acceder a la cámara.");
          }
        }
      } else { 
        stopCamera(); 
      }
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
        if (isAIStudio && (err.message?.includes("403") || err.message?.includes("API key") || err.message?.includes("401"))) {
          setLoadingMsg("LLAVE INVÁLIDA. SELECCIONA UNA...");
          await handleOpenApiKeyDialog();
          iaResult = await analyzeCheckIn(photo, user.dressCode, user.referenceImage);
        } else {
          throw err;
        }
      }

      const lastLog = await fetchLastLog(user.id);
      let type: 'CHECK_IN' | 'CHECK_OUT' = 'CHECK_IN';
      
      if (lastLog && lastLog.type === 'CHECK_IN') {
        const lastTimestamp = new Date(lastLog.timestamp).getTime();
        const now = new Date().getTime();
        const diffHours = (now - lastTimestamp) / (1000 * 60 * 60);
        if (diffHours < 20) type = 'CHECK_OUT';
        else type = 'CHECK_IN';
      } else {
        type = 'CHECK_IN';
      }

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
      console.error("Error en validación:", error);
      alert("Error en validación: " + (error.message || "Error desconocido"));
      if (isAIStudio) await handleOpenApiKeyDialog();
    } finally { setLoading(false); setLoadingMsg(''); }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      
      if (context && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.save();
        context.scale(-1, 1);
        context.translate(-canvas.width, 0);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        context.restore();
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        if (dataUrl && dataUrl.length > 100) {
          setPhoto(dataUrl);
          setCameraActive(false);
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

  const handleSaveManualLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualLogData.userId || !manualLogData.locationId) return alert("Selecciona colaborador y sede.");
    setIsSavingManual(true);
    try {
      const targetUser = allUsers.find(u => u.id === manualLogData.userId);
      const targetLoc = locations.find(l => l.id === manualLogData.locationId);
      if (!targetUser || !targetLoc) throw new Error("Datos de usuario o sede inválidos");

      const checkInTS = new Date(`${manualLogData.date}T${manualLogData.checkInTime}:00`).toISOString();
      const checkOutTS = new Date(`${manualLogData.date}T${manualLogData.checkOutTime}:00`).toISOString();

      if (manualLogData.type === 'CHECK_IN' || manualLogData.type === 'BOTH') {
        const inLog: LogEntry = {
          id: '', userId: targetUser.id, userName: targetUser.name, legajo: targetUser.legajo, timestamp: checkInTS, type: 'CHECK_IN',
          locationId: targetLoc.id, locationName: targetLoc.name, locationStatus: 'SKIPPED',
          dressCodeStatus: 'SKIPPED', identityStatus: 'SKIPPED',
          photoEvidence: '', aiFeedback: 'Carga manual por administrador'
        };
        await addLog(inLog);
      }

      if (manualLogData.type === 'CHECK_OUT' || manualLogData.type === 'BOTH') {
        const outLog: LogEntry = {
          id: '', userId: targetUser.id, userName: targetUser.name, legajo: targetUser.legajo, timestamp: checkOutTS, type: 'CHECK_OUT',
          locationId: targetLoc.id, locationName: targetLoc.name, locationStatus: 'SKIPPED',
          dressCodeStatus: 'SKIPPED', identityStatus: 'SKIPPED',
          photoEvidence: '', aiFeedback: 'Carga manual por administrador'
        };
        await addLog(outLog);
      }

      alert("Fichada manual cargada con éxito.");
      setShowManualLogModal(false);
      setManualUserSearch('');
      loadData(true);
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsSavingManual(false);
    }
  };

  const filteredManualUsers = allUsers.filter(u => 
    u.name.toLowerCase().includes(manualUserSearch.toLowerCase()) || 
    u.dni.toLowerCase().includes(manualUserSearch.toLowerCase()) ||
    u.legajo.toLowerCase().includes(manualUserSearch.toLowerCase())
  );

  if (user.role === 'Admin') {
    const incidentLogs = adminLogs.filter(l => l.dressCodeStatus === 'FAIL' || l.identityStatus === 'NO_MATCH');
    const noExitLogs = adminLogs.filter(log => {
      if (log.type !== 'CHECK_IN') return false;
      const userLogs = adminLogs
        .filter(l => l.userId === log.userId)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const idx = userLogs.findIndex(l => l.id === log.id);
      const nextLog = userLogs[idx + 1];
      const isOld = (new Date().getTime() - new Date(log.timestamp).getTime()) > 20 * 60 * 60 * 1000;
      return (nextLog && nextLog.type === 'CHECK_IN') || (!nextLog && isOld);
    });

    return (
      <div className="max-w-full mx-auto p-4 md:p-8 space-y-6 md:space-y-8 animate-in fade-in duration-500">
        
        {showManualLogModal && (
          <div className="fixed inset-0 z-[300] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-xl rounded-[40px] shadow-2xl overflow-visible animate-in zoom-in-95 duration-300">
               <div className="p-8 border-b flex items-center justify-between">
                  <h3 className="text-2xl font-black uppercase tracking-tighter">Carga Manual de Fichada</h3>
                  <button onClick={() => { setShowManualLogModal(false); setManualUserSearch(''); setIsUserListOpen(false); }} className="p-2 text-slate-400 hover:text-slate-900"><X/></button>
               </div>
               <form onSubmit={handleSaveManualLog} className="p-8 space-y-6">
                  <div className="space-y-2 relative">
                    <label className="text-[10px] font-black uppercase text-slate-400">Colaborador</label>
                    <div className="relative group">
                       <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400">
                         <Search size={18} />
                       </div>
                       <input 
                         type="text" 
                         placeholder="Escribe DNI o Nombre..." 
                         value={manualUserSearch} 
                         onFocus={() => setIsUserListOpen(true)}
                         onChange={e => { setManualUserSearch(e.target.value); setIsUserListOpen(true); }}
                         className="w-full pl-12 pr-12 py-4 bg-slate-50 rounded-2xl border-none font-bold text-sm outline-none focus:ring-2 focus:ring-orange-500/20" 
                       />
                       <button type="button" onClick={() => setIsUserListOpen(!isUserListOpen)} className="absolute inset-y-0 right-4 flex items-center text-slate-400">
                          <ChevronDown size={18} className={`transition-transform ${isUserListOpen ? 'rotate-180' : ''}`} />
                       </button>
                    </div>

                    {isUserListOpen && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 max-h-60 overflow-y-auto z-[310] py-2 animate-in fade-in slide-in-from-top-2">
                         {filteredManualUsers.length === 0 ? (
                            <div className="px-6 py-4 text-slate-400 text-xs font-bold uppercase italic">Sin coincidencias</div>
                         ) : filteredManualUsers.map(u => (
                            <button 
                              key={u.id} 
                              type="button"
                              onClick={() => {
                                setManualLogData({...manualLogData, userId: u.id});
                                setManualUserSearch(u.name.toUpperCase());
                                setIsUserListOpen(false);
                              }}
                              className="w-full text-left px-6 py-3 hover:bg-orange-50 transition-colors flex items-center justify-between group"
                            >
                               <div>
                                  <span className="block text-xs font-black text-slate-900 uppercase group-hover:text-orange-700">{u.name}</span>
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">DNI: {u.dni} | Lgj: {u.legajo}</span>
                               </div>
                               {manualLogData.userId === u.id && <Check size={16} className="text-orange-600" />}
                            </button>
                         ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400">Tipo de Fichada</label>
                    <select value={manualLogData.type} onChange={e => setManualLogData({...manualLogData, type: e.target.value as any})} className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold text-sm outline-none">
                       <option value="CHECK_IN">SÓLO INGRESO</option>
                       <option value="CHECK_OUT">SÓLO EGRESO</option>
                       <option value="BOTH">INGRESO Y EGRESO</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400">Fecha</label>
                      <input type="date" value={manualLogData.date} onChange={e => setManualLogData({...manualLogData, date: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold text-sm outline-none" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400">Sede</label>
                      <select value={manualLogData.locationId} onChange={e => setManualLogData({...manualLogData, locationId: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold text-sm outline-none">
                         <option value="">Seleccionar sede...</option>
                         {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className={`space-y-2 ${manualLogData.type === 'CHECK_OUT' ? 'opacity-30 pointer-events-none' : ''}`}>
                      <label className="text-[10px] font-black uppercase text-slate-400">Hora Ingreso</label>
                      <input type="time" value={manualLogData.checkInTime} onChange={e => setManualLogData({...manualLogData, checkInTime: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold text-sm outline-none" />
                    </div>
                    <div className={`space-y-2 ${manualLogData.type === 'CHECK_IN' ? 'opacity-30 pointer-events-none' : ''}`}>
                      <label className="text-[10px] font-black uppercase text-slate-400">Hora Egreso</label>
                      <input type="time" value={manualLogData.checkOutTime} onChange={e => setManualLogData({...manualLogData, checkOutTime: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold text-sm outline-none" />
                    </div>
                  </div>
                  <div className="pt-4 flex gap-4">
                    <button type="button" onClick={() => { setShowManualLogModal(false); setManualUserSearch(''); setIsUserListOpen(false); }} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[10px] tracking-widest">Cancelar</button>
                    <button type="submit" disabled={isSavingManual} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl flex items-center justify-center gap-2">
                       {isSavingManual ? <RefreshCw className="animate-spin" size={14}/> : <Save size={14}/>} Guardar Fichada
                    </button>
                  </div>
               </form>
            </div>
          </div>
        )}

        {showAlerts && (
          <div className="fixed inset-0 z-[200] bg-slate-900/95 backdrop-blur-xl flex items-center justify-center p-2 md:p-6">
            <div className="bg-white w-full max-w-5xl max-h-[95vh] rounded-[40px] md:rounded-[64px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 border-4 border-slate-100">
                <div className="p-8 md:p-12 border-b flex items-center justify-between gap-6 bg-white relative">
                   <div className="flex items-center gap-6">
                      <div className="w-16 h-16 bg-rose-50 rounded-[24px] flex items-center justify-center text-rose-600 shadow-inner">
                        <Bell className="animate-ring" size={32}/>
                      </div>
                      <div>
                        <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tighter text-slate-900 leading-none">
                          CENTRO DE INCIDENCIAS
                        </h2>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 italic flex items-center gap-2">
                           <Shield size={12}/> Seguridad en Tiempo Real - UpFest Control
                        </p>
                      </div>
                   </div>
                   <button onClick={() => setShowAlerts(false)} className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 hover:bg-rose-600 hover:text-white transition-all shadow-sm"><X size={24}/></button>
                </div>

                <div className="px-8 py-6 md:px-12 bg-slate-50 border-b space-y-4">
                   <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mr-2 flex items-center gap-1"><Filter size={12}/> Periodo Alertas:</span>
                      {[
                          { id: 'today', label: 'Hoy', icon: Clock },
                          { id: 'yesterday', label: 'Ayer', icon: RotateCcw },
                          { id: 'week', label: 'Semana', icon: Calendar },
                          { id: 'month', label: 'Mes', icon: Briefcase }
                      ].map(f => (
                          <button key={f.id} onClick={() => applyQuickFilter(f.id as any)} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2 transition-all border-2 ${activeQuickFilter === f.id ? 'bg-rose-600 border-rose-600 text-white shadow-lg' : 'bg-white border-slate-100 text-slate-500 hover:border-rose-400'}`}>
                              <f.icon size={12}/> {f.label}
                          </button>
                      ))}
                      {(filterStartDate || filterEndDate) && (
                          <button onClick={handleClearFilter} className="px-4 py-2 bg-rose-50 text-rose-600 border-2 border-rose-100 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2"><X size={12}/> Limpiar Rango</button>
                      )}
                   </div>
                   <div className="flex flex-col md:flex-row gap-4 items-end">
                      <div className="flex-1 grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[8px] font-black uppercase text-slate-400">Desde</label>
                          {/* FIX: Passed e.target.value to state setter instead of dispatcher directly */}
                          <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} className="w-full bg-white border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none focus:border-rose-500" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8px] font-black uppercase text-slate-400">Hasta</label>
                          {/* FIX: Passed e.target.value to state setter instead of dispatcher directly */}
                          <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} className="w-full bg-white border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none focus:border-rose-500" />
                        </div>
                      </div>
                      <button onClick={handleApplyFilter} className="bg-slate-900 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-slate-800 transition-all shadow-lg">
                        <Search size={14}/> Buscar en Historial
                      </button>
                   </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 md:p-12 space-y-6 bg-slate-50/30">
                   {incidentLogs.length === 0 ? (
                     <div className="py-32 text-center flex flex-col items-center gap-8 animate-in fade-in zoom-in-95">
                        <div className="w-32 h-32 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 shadow-inner">
                          <CheckCircle size={64}/>
                        </div>
                        <div className="space-y-2">
                          <p className="text-xl font-black text-slate-800 uppercase tracking-tighter">SIN INCIDENCIAS EN EL PERIODO</p>
                          <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Todo bajo control - UpFest Security</p>
                        </div>
                     </div>
                   ) : (
                     <div className="grid grid-cols-1 gap-6">
                        {incidentLogs.map(log => (
                          <div key={log.id} className="bg-white border-2 border-slate-100 rounded-[40px] p-6 md:p-10 flex flex-col md:flex-row gap-10 items-start md:items-center shadow-sm hover:shadow-2xl hover:border-rose-100 transition-all group animate-in slide-in-from-bottom-4">
                              <div onClick={() => log.photoEvidence && setZoomedImage(log.photoEvidence)} className="w-40 h-40 md:w-56 md:h-56 shrink-0 bg-slate-900 rounded-[32px] overflow-hidden border-8 border-slate-50 cursor-zoom-in relative group/img shadow-2xl">
                                {log.photoEvidence ? (
                                  <img src={log.photoEvidence} className="w-full h-full object-cover group-hover/img:scale-110 transition-transform duration-700" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-slate-500"><UserIcon size={48}/></div>
                                )}
                                <div className="absolute inset-0 bg-rose-600/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center text-white transition-opacity backdrop-blur-sm">
                                  <Maximize2 size={32}/>
                                </div>
                              </div>
                              <div className="flex-1 space-y-6">
                                <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-4">
                                      <span className="font-black text-3xl text-slate-900 uppercase tracking-tighter leading-none">{log.userName}</span>
                                      <span className="px-4 py-1.5 bg-slate-100 text-slate-500 text-[10px] font-black uppercase rounded-lg border border-slate-200">Lgj: {log.legajo}</span>
                                    </div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                      <Building size={14}/> Sede: {log.locationName} <span className="text-slate-200">|</span> <Clock size={14}/> {getFormattedDate(log.timestamp)}
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-3">
                                    {log.identityStatus === 'NO_MATCH' && (
                                      <div className="flex items-center gap-3 px-5 py-2.5 bg-rose-600 text-white rounded-2xl shadow-lg shadow-rose-100">
                                        <UserIcon size={16}/>
                                        <span className="text-[10px] font-black uppercase tracking-widest">Identidad no validada</span>
                                      </div>
                                    )}
                                    {log.dressCodeStatus === 'FAIL' && (
                                      <div className="flex items-center gap-3 px-5 py-2.5 bg-orange-500 text-white rounded-2xl shadow-lg shadow-orange-100">
                                        <Shirt size={16}/>
                                        <span className="text-[10px] font-black uppercase tracking-widest">Fallo de Vestimenta</span>
                                      </div>
                                    )}
                                </div>
                                <div className="bg-slate-50 p-6 rounded-[28px] border-2 border-slate-100 relative">
                                    <p className="text-[11px] italic text-slate-600 leading-relaxed font-medium">"{log.aiFeedback}"</p>
                                    <div className="absolute -top-3 left-6 px-3 bg-white text-[8px] font-black uppercase text-slate-300 tracking-widest border border-slate-100 rounded-md">ANÁLISIS IA</div>
                                </div>
                              </div>
                              <div className="w-full md:w-auto flex md:flex-col gap-2">
                                 <button onClick={() => log.photoEvidence && setZoomedImage(log.photoEvidence)} className="flex-1 p-5 bg-slate-50 text-slate-400 rounded-3xl hover:bg-slate-900 hover:text-white transition-all shadow-sm">
                                    <Eye size={24} className="mx-auto"/>
                                 </button>
                                 <button onClick={() => handleDeleteLog(log.id)} className="flex-1 p-5 bg-rose-50 text-rose-400 rounded-3xl hover:bg-rose-600 hover:text-white transition-all shadow-sm">
                                    <Trash2 size={24} className="mx-auto"/>
                                 </button>
                              </div>
                          </div>
                        ))}
                     </div>
                   )}
                </div>

                <div className="p-10 md:p-14 border-t bg-white flex justify-center">
                   <button onClick={() => setShowAlerts(false)} className="w-full md:w-80 py-6 bg-slate-900 text-white rounded-[28px] font-black uppercase tracking-[0.2em] shadow-2xl hover:scale-[1.05] hover:bg-slate-800 transition-all text-xs">
                     Cerrar Todo
                   </button>
                </div>
            </div>
          </div>
        )}

        {showNoExitsModal && (
          <div className="fixed inset-0 z-[200] bg-slate-900/95 backdrop-blur-xl flex items-center justify-center p-2 md:p-6">
            <div className="bg-white w-full max-w-5xl max-h-[95vh] rounded-[40px] md:rounded-[64px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 border-4 border-slate-100">
                <div className="p-8 md:p-12 border-b flex items-center justify-between gap-6 bg-white relative">
                   <div className="flex items-center gap-6">
                      <div className="w-16 h-16 bg-orange-50 rounded-[24px] flex items-center justify-center text-orange-600 shadow-inner">
                        <TimerOff size={32}/>
                      </div>
                      <div>
                        <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tighter text-slate-900 leading-none">
                          INGRESOS SIN EGRESO
                        </h2>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 italic flex items-center gap-2">
                           <Clock size={12}/> Regla de las 20 horas - UpFest Control
                        </p>
                      </div>
                   </div>
                   <button onClick={() => setShowNoExitsModal(false)} className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 hover:bg-orange-600 hover:text-white transition-all shadow-sm"><X size={24}/></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 md:p-12 space-y-6 bg-slate-50/30">
                   {noExitLogs.length === 0 ? (
                     <div className="py-32 text-center flex flex-col items-center gap-8 animate-in fade-in zoom-in-95">
                        <div className="w-32 h-32 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 shadow-inner">
                          <CheckCircle size={64}/>
                        </div>
                        <p className="text-xl font-black text-slate-800 uppercase tracking-tighter">NÓMINA AL DÍA</p>
                     </div>
                   ) : (
                     <div className="grid grid-cols-1 gap-6">
                        {noExitLogs.map(log => (
                          <div key={log.id} className="bg-white border-2 border-slate-100 rounded-[40px] p-6 md:p-10 flex flex-col md:flex-row gap-10 items-start md:items-center shadow-sm hover:shadow-2xl hover:border-orange-100 transition-all group animate-in slide-in-from-bottom-4">
                              <div onClick={() => log.photoEvidence && setZoomedImage(log.photoEvidence)} className="w-40 h-40 md:w-56 md:h-56 shrink-0 bg-slate-900 rounded-[32px] overflow-hidden border-8 border-slate-50 cursor-zoom-in relative group/img shadow-2xl">
                                {log.photoEvidence ? (
                                  <img src={log.photoEvidence} className="w-full h-full object-cover group-hover/img:scale-110 transition-transform duration-700" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-slate-500"><UserIcon size={48}/></div>
                                )}
                              </div>
                              <div className="flex-1 space-y-6">
                                <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-4">
                                      <span className="font-black text-3xl text-slate-900 uppercase tracking-tighter leading-none">{log.userName}</span>
                                      <span className="px-4 py-1.5 bg-slate-100 text-slate-500 text-[10px] font-black uppercase rounded-lg">Lgj: {log.legajo}</span>
                                    </div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                      <Building size={14}/> Sede: {log.locationName} <span className="text-slate-200">|</span> <Clock size={14}/> In: {new Date(log.timestamp).toLocaleString('es-AR')}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3 px-5 py-2.5 bg-orange-600 text-white rounded-2xl shadow-lg w-fit">
                                    <TimerOff size={16}/>
                                    <span className="text-[10px] font-black uppercase tracking-widest">Turno sin cierre</span>
                                </div>
                                <div className="bg-slate-50 p-6 rounded-[28px] border-2 border-slate-100">
                                    <p className="text-[11px] italic text-slate-600 leading-relaxed font-medium">
                                      El sistema cerrará este turno automáticamente cuando el colaborador vuelva a fichar un ingreso.
                                    </p>
                                </div>
                              </div>
                          </div>
                        ))}
                     </div>
                   )}
                </div>

                <div className="p-10 md:p-14 border-t bg-white flex justify-center">
                   <button onClick={() => setShowNoExitsModal(false)} className="w-full md:w-80 py-6 bg-slate-900 text-white rounded-[28px] font-black uppercase tracking-[0.2em] shadow-2xl hover:scale-[1.05] transition-all text-xs">
                     Cerrar
                   </button>
                </div>
            </div>
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
              <div className="flex flex-wrap items-center gap-2 md:gap-3 w-full md:w-auto justify-center">
                <button onClick={() => setShowManualLogModal(true)} className="flex-1 md:flex-none px-4 md:px-6 py-3 md:py-4 rounded-full bg-slate-900 text-white flex items-center justify-center gap-3 transition-all hover:bg-slate-800 shadow-sm">
                    <CalendarPlus size={18}/><span className="text-[10px] font-black uppercase">Fichada Manual</span>
                </button>
                <button onClick={handleExportExcel} className="flex-1 md:flex-none px-4 md:px-6 py-3 md:py-4 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center gap-3 transition-all hover:bg-emerald-100 shadow-sm">
                    <Download size={18}/><span className="text-[10px] font-black uppercase">Exportar Reporte</span>
                </button>
                <button onClick={() => setShowAlerts(true)} className={`flex-1 md:flex-none px-4 md:px-6 py-3 md:py-4 rounded-full border flex items-center justify-center gap-3 transition-all ${incidentLogs.length > 0 ? 'bg-red-50 border-red-200 text-red-600 shadow-lg shadow-red-100' : 'bg-slate-50 text-slate-400'}`}>
                    <Bell size={18} className={incidentLogs.length > 0 ? 'animate-bounce' : ''}/><span className="text-[10px] font-black uppercase">Alertas ({incidentLogs.length})</span>
                </button>
                <button onClick={() => setShowNoExitsModal(true)} className={`flex-1 md:flex-none px-4 md:px-6 py-3 md:py-4 rounded-full border flex items-center justify-center gap-3 transition-all ${noExitLogs.length > 0 ? 'bg-orange-50 border-orange-200 text-orange-600 shadow-lg shadow-orange-100' : 'bg-slate-50 text-slate-400'}`}>
                    <TimerOff size={18}/><span className="text-[10px] font-black uppercase">Sin Egreso ({noExitLogs.length})</span>
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
                    const isNoExitCase = noExitLogs.some(n => n.id === log.id);
                    return (
                      <tr key={log.id} className={`hover:bg-white transition-all ${isNoExitCase ? 'bg-orange-50/20' : ''}`}>
                        <td className="p-6 text-center">
                          <div onClick={() => log.photoEvidence && setZoomedImage(log.photoEvidence)} className="w-14 h-14 mx-auto rounded-xl overflow-hidden border-2 border-white cursor-zoom-in shadow-md">
                            {log.photoEvidence ? <img src={log.photoEvidence} className="w-full h-full object-cover" /> : <div className="bg-slate-100 w-full h-full flex items-center justify-center">{log.aiFeedback.includes('manual') ? <FileText className="text-slate-300" /> : <UserIcon className="text-slate-300" />}</div>}
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
                           ) : <span className="text-slate-200">{isNoExitCase ? <span className="text-[9px] font-black text-orange-500 uppercase">Sin Egreso</span> : '---'}</span>}
                        </td>
                        <td className="p-6 text-center border-l border-slate-100">
                          <span className={`text-[9px] font-black uppercase px-3 py-1 rounded-lg ${log.identityStatus === 'MATCH' ? 'bg-emerald-100 text-emerald-700' : (log.identityStatus === 'SKIPPED' ? 'bg-slate-100 text-slate-500' : 'bg-rose-100 text-rose-700')}`}>{log.identityStatus === 'MATCH' ? 'Válido' : (log.identityStatus === 'SKIPPED' ? 'Omitido' : 'Fallo')}</span>
                        </td>
                        <td className="p-6 text-center">
                          <span className={`text-[9px] font-black uppercase px-3 py-1 rounded-lg ${log.dressCodeStatus === 'PASS' ? 'bg-emerald-100 text-emerald-700' : (log.dressCodeStatus === 'SKIPPED' ? 'bg-slate-100 text-slate-500' : 'bg-rose-100 text-rose-700')}`}>{log.dressCodeStatus === 'PASS' ? 'Correcto' : (log.dressCodeStatus === 'SKIPPED' ? 'Omitido' : 'Error')}</span>
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
        {zoomedImage && (<div className="fixed inset-0 z-[250] bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setZoomedImage(null)}><img src={zoomedImage} className="max-w-full max-h-full rounded-[40px] shadow-2xl border-4 md:border-8 border-white animate-in zoom-in-95" /></div>)}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 relative min-h-full">
      {successAction && (
        <div className="fixed inset-0 z-[500] bg-slate-900/95 backdrop-blur-3xl flex flex-col items-center justify-center animate-in fade-in duration-500 p-6 text-center">
           <div className="w-32 h-32 bg-white/10 rounded-full flex items-center justify-center mb-10 animate-bounce shadow-[0_0_50px_rgba(255,255,255,0.1)] border-4 border-white/20">
             <CheckCircle size={64} className="text-emerald-400" />
           </div>
           <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter mb-6 text-white leading-none">
             ¡{successAction.type} <span className="text-emerald-400">REGISTRADO</span>!
           </h2>
           <div className="bg-white/5 border border-white/10 px-8 py-4 rounded-3xl mb-12 backdrop-blur-md">
             <p className="text-lg md:text-xl font-black text-slate-300 uppercase tracking-[0.3em]">Redirigiendo en {successAction.countdown} segundos...</p>
           </div>
           <button onClick={onLogout} className="text-sm font-black uppercase text-slate-400 hover:text-white border-b-2 border-slate-700 hover:border-white transition-all pb-1 tracking-[0.2em]">Cerrar sesión ahora</button>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-[32px] md:rounded-[40px] p-8 border shadow-xl flex flex-col min-h-[500px]">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-black uppercase tracking-tighter">Fichador</h2>
            {deviceLocation && <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">{deviceLocation.name}</span>}
          </div>
          <div className="w-full h-auto aspect-square min-h-[300px] md:min-h-[350px] rounded-[32px] overflow-hidden bg-slate-900 mb-6 relative border-4 border-slate-100 shadow-inner flex items-center justify-center">
             {!cameraActive && !photo && (
               <button onClick={() => setCameraActive(true)} className="absolute inset-0 w-full h-full text-white font-black uppercase text-xs flex flex-col items-center justify-center gap-6 hover:bg-slate-800 transition-colors px-10 text-center z-20">
                 <div className="w-24 h-24 rounded-full bg-orange-600 flex items-center justify-center shadow-2xl ring-[12px] ring-orange-50/10 mb-2 active:scale-90 transition-transform"><Camera size={40}/></div>
                 <span className="tracking-[0.2em] text-sm">Activar Cámara</span>
                 {cameraError && (
                   <div className="p-4 bg-rose-500/20 backdrop-blur-md rounded-2xl border border-rose-500/50 mt-4">
                      <p className="text-rose-200 text-[10px] leading-tight font-bold">{cameraError}</p>
                   </div>
                 )}
               </button>
             )}
             {cameraActive && <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover scale-x-[-1]" />}
             {photo && <img src={photo} className="w-full h-full object-cover" />}
             {loading && (
               <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center text-white p-6 text-center z-[30]">
                 <RefreshCw className="animate-spin mb-4" size={32} />
                 <p className="font-black text-[10px] uppercase tracking-widest">{loadingMsg || 'Procesando...'}</p>
               </div>
             )}
          </div>
          <div className="space-y-3 mt-auto">
            {cameraActive && <button onClick={capturePhoto} className="w-full py-6 bg-orange-600 text-white rounded-[24px] font-black uppercase tracking-[0.2em] text-xs shadow-xl transition-all active:scale-95">Capturar Foto</button>}
            {photo && !loading && <button onClick={handleClockAction} className="w-full py-6 bg-slate-900 text-white rounded-[24px] font-black uppercase tracking-[0.2em] text-xs shadow-xl flex items-center justify-center gap-3">Confirmar Fichada <ArrowRight size={20}/></button>}
            {photo && !loading && <button onClick={() => { setPhoto(null); setCameraActive(true); }} className="w-full py-4 bg-slate-100 text-slate-500 rounded-[20px] font-black uppercase text-[10px] tracking-widest">Tomar otra foto</button>}
          </div>
          
          {/* Alerta de Diagnóstico para Tablets */}
          {!cameraActive && !photo && !window.isSecureContext && (
             <div className="mt-6 p-6 bg-rose-50 border-2 border-rose-100 rounded-[28px] flex items-start gap-4 animate-in slide-in-from-top-4">
                <AlertTriangle className="text-rose-500 shrink-0" size={24}/>
                <div className="space-y-1">
                   <p className="text-[11px] font-black text-rose-800 uppercase leading-none tracking-widest">Conexión No Segura Detectada</p>
                   <p className="text-[10px] font-medium text-rose-600 leading-relaxed mt-1">La cámara se bloquea en tablets si no usas <strong>HTTPS</strong>. Asegúrate de que la dirección empiece con https:// o contacta a soporte.</p>
                </div>
             </div>
          )}
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
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-none">{l.locationName}</span>
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

// --- Personal Dashboard ---
const AdminDashboard = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<Location[]>([]);
  const [formData, setFormData] = useState<Partial<User>>({});
  const [formSaving, setFormSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [importing, setImporting] = useState(false);
  const [isDeletingUser, setIsDeletingUser] = useState<string | null>(null);
  const [dbHealthy, setDbHealthy] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const load = async () => { 
    setLoading(true); 
    try { 
      const [u, l, healthy] = await Promise.all([fetchUsers(), fetchLocations(), checkDatabaseHealth()]); 
      setUsers(u); 
      setLocations(l); 
      setDbHealthy(healthy);
    } catch (err) { console.error("Error al cargar nómina:", err); } 
    finally { setLoading(false); } 
  };

  useEffect(() => { load(); }, []);

  useEffect(() => { 
    if (editingUser) setFormData({ ...editingUser, schedule: editingUser.schedule || [], assignedLocations: editingUser.assignedLocations || [], isActive: editingUser.isActive }); 
    else setFormData({ role: 'Mozo', schedule: [], assignedLocations: [], password: '1234', legajo: '', isActive: true }); 
    setShowPassword(false);
  }, [editingUser, isCreating]);

  const handleDownloadTemplate = () => {
    const headers = [
      'Nombre', 'DNI', 'Legajo', 'Rol', 'Contraseña', 'Codigo Vestimenta',
      'Lunes_Inicio', 'Lunes_Fin',
      'Martes_Inicio', 'Martes_Fin',
      'Miércoles_Inicio', 'Miércoles_Fin',
      'Jueves_Inicio', 'Jueves_Fin',
      'Viernes_Inicio', 'Viernes_Fin',
      'Sábado_Inicio', 'Sábado_Fin',
      'Domingo_Inicio', 'Domingo_Fin'
    ];
    const data = [headers, ['Juan Perez', '12345678', 'LG-001', 'Mozo', '1234', 'Remera Negra', '09:00', '18:00', '', '', '', '', '', '', '', '', '', '', '', '']];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla_RRHH");
    XLSX.writeFile(wb, "UpFest_Plantilla_RRHH.xlsx");
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(ws);
        
        for (const row of (rawData as any[])) {
          const schedule: WorkSchedule[] = [];
          DAYS_OF_WEEK.forEach(day => {
            const startKey = `${day}_Inicio`;
            const endKey = `${day}_Fin`;
            if (row[startKey] && row[endKey]) {
              schedule.push({ startDay: day, startTime: String(row[startKey]), endDay: day, endTime: String(row[endKey]) });
            }
          });

          const newUser: User = {
            id: '',
            name: String(row['Nombre'] || ''),
            dni: String(row['DNI'] || ''),
            legajo: String(row['Legajo'] || ''),
            role: String(row['Rol'] || 'Mozo'),
            password: String(row['Contraseña'] || '1234'),
            dressCode: String(row['Codigo Vestimenta'] || ''),
            schedule: schedule,
            referenceImage: null,
            assignedLocations: [],
            isActive: true
          };
          if (newUser.name && newUser.dni) await saveUser(newUser);
        }
        alert("Importación completada exitosamente");
        load();
      } catch (err: any) { alert("Error procesando archivo: " + err.message); }
      finally { setImporting(false); if (importInputRef.current) importInputRef.current.value = ''; }
    };
    reader.readAsBinaryString(file);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault(); 
    if (!formData.name || !formData.dni || !formData.password) return alert("Nombre, DNI y Contraseña obligatorios");
    setFormSaving(true); 
    try { 
      await saveUser(formData as User); 
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setEditingUser(null); 
        setIsCreating(false); 
        load(); 
      }, 1500);
    } catch (err: any) { 
      console.error("Error al guardar usuario:", err);
      alert("Error al guardar: " + err.message); 
    } 
    finally { setFormSaving(false); }
  };

  const handleDeleteUserDirect = async (userId: string, userName: string) => {
    if (!confirm(`¿CONFIRMAS BORRAR A ${userName.toUpperCase()}? ESTA ACCIÓN NO SE PUEDE DESHACER.`)) return;
    setIsDeletingUser(userId);
    try {
      await deleteUser(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err: any) {
      alert("Error al borrar: " + err.message);
    } finally {
      setIsDeletingUser(null);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setFormData({ ...formData, referenceImage: reader.result as string });
      reader.readAsDataURL(file);
    }
  };

  const toggleLocation = (locId: string) => {
    const current = formData.assignedLocations || [];
    if (current.includes(locId)) setFormData({ ...formData, assignedLocations: current.filter(id => id !== locId) });
    else setFormData({ ...formData, assignedLocations: [...current, locId] });
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

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.dni.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8 animate-in fade-in">
      {!dbHealthy && (
        <div className="bg-amber-50 border border-amber-200 p-6 rounded-[24px] flex flex-col md:flex-row items-center gap-4 animate-bounce shadow-xl">
           <Activity className="text-amber-600 shrink-0" size={32}/>
           <div className="flex-1 text-center md:text-left">
              <p className="font-black text-[10px] uppercase tracking-widest text-amber-700">Actualización de Base de Datos Necesaria</p>
              <p className="text-xs font-bold text-amber-900 leading-tight">Ejecuta el script SQL incluido para habilitar estados y sedes asignadas.</p>
           </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div className="text-center md:text-left">
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Personal</h1>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Nómina UpFest Control</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button onClick={handleDownloadTemplate} className="flex-1 md:flex-none bg-emerald-50 text-emerald-600 border border-emerald-200 px-6 py-4 rounded-2xl flex items-center justify-center gap-3 shadow-sm font-black text-[10px] uppercase tracking-widest hover:bg-emerald-100 transition-all">
            <FileSpreadsheet size={18} /> Descargar Plantilla
          </button>
          <button onClick={() => importInputRef.current?.click()} disabled={importing} className="flex-1 md:flex-none bg-blue-50 text-blue-600 border border-blue-200 px-6 py-4 rounded-2xl flex items-center justify-center gap-3 shadow-sm font-black text-[10px] uppercase tracking-widest hover:bg-blue-100 transition-all">
            {importing ? <RefreshCw className="animate-spin" size={18}/> : <FileUp size={18} />} {importing ? 'Subiendo...' : 'Importar Excel'}
          </button>
          <input type="file" ref={importInputRef} onChange={handleImportExcel} className="hidden" accept=".xlsx,.xls" />
          <button onClick={() => setIsCreating(true)} className="flex-1 md:flex-none bg-slate-900 text-white px-8 py-4 rounded-2xl flex items-center justify-center gap-3 shadow-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-colors">
            <Plus size={18} /> Nuevo Colaborador
          </button>
        </div>
      </div>

      <div className="mb-6 relative group">
          <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-slate-400 group-focus-within:text-orange-600 transition-colors">
            <Search size={22} />
          </div>
          <input 
            type="text" 
            placeholder="BUSCAR POR NOMBRE O DNI..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-16 pr-8 py-6 bg-white border-2 border-slate-100 rounded-[24px] font-black uppercase text-xs tracking-widest outline-none focus:border-orange-500 shadow-sm transition-all placeholder:text-slate-300"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-6 flex items-center text-slate-300 hover:text-rose-500">
              <XCircle size={20} />
            </button>
          )}
      </div>
      
      <div className="bg-white rounded-[32px] border overflow-hidden shadow-sm">
         <div className="overflow-x-auto"><table className="w-full text-left border-collapse">
           <thead><tr className="bg-slate-50 border-b"><th className="p-6 text-[10px] font-black uppercase">Colaborador</th><th className="p-6 text-[10px] font-black uppercase">DNI</th><th className="p-6 text-[10px] font-black uppercase">Rol</th><th className="p-6 text-right">Acciones</th></tr></thead>
           <tbody className="divide-y">
             {filteredUsers.length === 0 ? (
               <tr><td colSpan={4} className="p-20 text-center text-slate-300 font-black uppercase italic">Sin personal para mostrar {searchTerm && `con el término "${searchTerm}"`}</td></tr>
             ) : filteredUsers.map(u => (
               <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                 <td className="p-6 flex items-center gap-4">
                   <div className="w-10 h-10 rounded-xl bg-slate-100 overflow-hidden border shrink-0">
                     {u.referenceImage && <img src={u.referenceImage} className="w-full h-full object-cover" />}
                   </div>
                   <span className="font-black text-slate-800 uppercase text-sm">{u.name}</span>
                 </td>
                 <td className="p-6 text-xs font-bold text-slate-500 font-mono">{u.dni}</td>
                 <td className="p-6 text-[10px] font-black uppercase text-slate-700">{u.role}</td>
                 <td className="p-6 text-right">
                   <div className="flex items-center justify-end gap-1">
                     <button onClick={() => setEditingUser(u)} className="p-3 text-slate-300 hover:text-orange-600 transition-colors" title="Editar">
                       <Pencil size={18}/>
                     </button>
                     <button 
                       disabled={isDeletingUser === u.id} 
                       onClick={() => handleDeleteUserDirect(u.id, u.name)} 
                       className="p-3 text-slate-300 hover:text-rose-600 transition-colors" 
                       title="Borrar Definitivamente"
                     >
                       {isDeletingUser === u.id ? <RefreshCw className="animate-spin" size={18}/> : <Trash2 size={18}/>}
                     </button>
                   </div>
                 </td>
               </tr>
             ))}
           </tbody>
         </table></div>
      </div>

      {(isCreating || editingUser) && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-2 md:p-4">
          <div className="bg-white rounded-[40px] md:rounded-[48px] w-full max-w-5xl shadow-2xl overflow-y-auto max-h-[95vh] relative animate-in zoom-in-95 duration-300">
            {saveSuccess && (
              <div className="absolute inset-0 bg-white/95 backdrop-blur-md z-[200] flex flex-col items-center justify-center animate-in fade-in duration-300">
                <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mb-6 animate-bounce shadow-xl shadow-emerald-50 border-4 border-white">
                  <Check size={48} className="text-emerald-600" />
                </div>
                <h3 className="text-3xl font-black uppercase tracking-tighter text-slate-900">CAMBIOS REALIZADOS</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 italic">ACTUALIZANDO NÓMINA...</p>
              </div>
            )}

            <button type="button" onClick={() => { setEditingUser(null); setIsCreating(false); }} className="absolute top-6 right-6 md:top-8 md:right-8 p-3 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-400 transition-colors z-10"><X size={20}/></button>
            <form onSubmit={handleSaveUser} className="p-6 md:p-12 space-y-8 md:space-y-12">
              <div className="border-b pb-6">
                  <h2 className="font-black text-3xl md:text-4xl text-slate-900 uppercase tracking-tighter leading-none">{editingUser ? 'EDITAR FICHA' : 'NUEVO COLABORADOR'}</h2>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 italic">SISTEMA RRHH - UPFEST</p>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 md:gap-12">
                <div className="flex flex-col items-center gap-6">
                    <div className="aspect-[4/5] w-full bg-slate-50 rounded-[32px] border-4 border-slate-100 relative overflow-hidden group shadow-inner">
                       {formData.referenceImage ? <img src={formData.referenceImage} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-200"><ImageIcon size={48}/></div>}
                       <button type="button" onClick={() => fileInputRef.current?.click()} className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-black text-xs uppercase gap-2 backdrop-blur-sm"><Upload size={18}/> Cambiar</button>
                    </div>
                    <input type="file" ref={fileInputRef} onChange={handleImageChange} className="hidden" accept="image/*" />
                    <div className="w-full space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">LEGAJO</label>
                        <input type="text" value={formData.legajo || ''} onChange={e => setFormData({...formData, legajo: e.target.value})} className="w-full p-4 bg-slate-50 rounded-[20px] font-black text-slate-900 outline-none text-xs" placeholder="ADM-000" />
                    </div>
                </div>

                <div className="xl:col-span-2 space-y-6 md:space-y-10">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="col-span-full space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Nombre Completo</label>
                      <input type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-5 bg-slate-50 rounded-[20px] font-black text-slate-900 outline-none uppercase text-sm md:text-base border border-transparent focus:border-slate-200" required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">DNI (Usuario)</label>
                      <input type="text" inputMode="numeric" value={formData.dni || ''} onChange={e => setFormData({...formData, dni: e.target.value})} className="w-full p-5 bg-slate-50 rounded-[20px] font-black text-slate-900 outline-none text-sm border border-transparent focus:border-slate-200" required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Rol / Puesto</label>
                      <select value={formData.role || 'Mozo'} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full p-5 bg-slate-50 rounded-[20px] font-black text-slate-900 outline-none appearance-none text-sm border border-transparent focus:border-slate-200">
                        {DEFAULT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Clave de Acceso</label>
                      <div className="relative">
                        <input 
                          type={showPassword ? "text" : "password"} 
                          value={formData.password || ''} 
                          onChange={e => setFormData({...formData, password: e.target.value})} 
                          className="w-full p-5 bg-slate-50 rounded-[20px] font-black text-slate-900 outline-none text-sm border border-transparent focus:border-slate-200 pr-12" 
                          required 
                        />
                        <button 
                          type="button" 
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showPassword ? <EyeOff size={20}/> : <Eye size={20}/>}
                        </button>
                      </div>
                    </div>
                    <div className="col-span-full space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Vestimenta Requerida</label>
                      <textarea value={formData.dressCode || ''} onChange={e => setFormData({...formData, dressCode: e.target.value})} className="w-full p-5 bg-slate-50 rounded-[20px] font-black text-slate-900 h-24 outline-none text-sm resize-none border border-transparent focus:border-slate-200" placeholder="Ej: Remera negra lisa, pantalón oscuro..." />
                    </div>
                  </div>

                  <div className="space-y-4">
                     <h4 className="font-black text-[12px] uppercase tracking-tighter flex items-center gap-2 text-slate-800"><MapPin size={18}/> SEDES ASIGNADAS</h4>
                     <div className="flex flex-wrap gap-3">
                        {locations.map(loc => {
                           const isActive = formData.assignedLocations?.includes(loc.id);
                           return (
                             <button 
                                key={loc.id} 
                                type="button" 
                                onClick={() => toggleLocation(loc.id)} 
                                className={`px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all flex items-center gap-3 ${isActive ? 'bg-white border-orange-500 text-orange-600 shadow-lg shadow-orange-50' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
                             >
                                {loc.name}
                                {isActive && <Check size={14}/>}
                             </button>
                           );
                        })}
                     </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50/50 p-6 md:p-10 rounded-[32px] md:rounded-[48px] border border-slate-100 space-y-8">
                 <div className="flex items-center justify-between gap-4">
                    <h4 className="font-black text-[12px] uppercase tracking-tighter flex items-center gap-3 text-slate-800"><Clock size={20}/> HORARIOS DE TRABAJO</h4>
                    <button type="button" onClick={addSchedule} className="bg-white border-2 border-slate-200 text-slate-900 px-6 py-3 rounded-2xl flex items-center gap-2 font-black text-[10px] uppercase tracking-widest shadow-sm hover:border-orange-500 hover:text-orange-600 transition-all">
                        <Plus size={18}/> AÑADIR FRANJA
                    </button>
                 </div>

                 <div className="grid grid-cols-1 gap-6">
                    {(!formData.schedule || formData.schedule.length === 0) ? (
                      <div className="py-12 text-center border-4 border-dashed rounded-[32px] border-slate-100">
                        <Calendar size={48} className="mx-auto text-slate-200 mb-4" strokeWidth={1}/>
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Sin horarios configurados</p>
                      </div>
                    ) : (
                      formData.schedule.map((slot, idx) => (
                        <div key={idx} className="bg-white p-8 rounded-[28px] shadow-sm border border-slate-100 relative group animate-in slide-in-from-right-4">
                           <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 items-center">
                              <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Inicia</label>
                                <select value={slot.startDay} onChange={e => updateSchedule(idx, 'startDay', e.target.value)} className="w-full bg-slate-50 p-4 rounded-xl border-none font-bold text-xs appearance-none cursor-pointer">
                                  {DAYS_OF_WEEK.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                              </div>
                              <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Entrada</label>
                                <div className="relative">
                                  <input type="time" value={slot.startTime} onChange={e => updateSchedule(idx, 'startTime', e.target.value)} className="w-full bg-slate-50 p-4 rounded-xl border-none font-bold text-xs cursor-pointer" />
                                  <Clock className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" size={14}/>
                                </div>
                              </div>
                              <div className="hidden md:flex items-center justify-center text-slate-200 pt-6">
                                <ArrowRight size={24}/>
                              </div>
                              <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Termina</label>
                                <select value={slot.endDay} onChange={e => updateSchedule(idx, 'endDay', e.target.value)} className="w-full bg-slate-50 p-4 rounded-xl border-none font-bold text-xs appearance-none cursor-pointer">
                                  {DAYS_OF_WEEK.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                              </div>
                              <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Salida</label>
                                <div className="relative">
                                  <input type="time" value={slot.endTime} onChange={e => updateSchedule(idx, 'endTime', e.target.value)} className="w-full bg-slate-50 p-4 rounded-xl border-none font-bold text-xs cursor-pointer" />
                                  <Clock className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" size={14}/>
                                </div>
                              </div>
                           </div>
                           <button type="button" onClick={() => removeSchedule(idx)} className="absolute -bottom-3 -left-3 md:bottom-auto md:left-auto md:top-6 md:right-6 p-4 bg-white md:bg-transparent text-slate-200 hover:text-rose-500 rounded-2xl shadow-lg md:shadow-none transition-all group-hover:scale-110">
                               <Trash2 size={20}/>
                           </button>
                        </div>
                      ))
                    )}
                 </div>
              </div>

              <div className="flex flex-col md:flex-row gap-4 pt-8">
                <button type="button" onClick={() => { setEditingUser(null); setIsCreating(false); }} className="flex-1 py-6 bg-white border-2 border-slate-100 text-slate-400 rounded-[28px] font-black uppercase tracking-widest text-[11px] hover:bg-slate-50 transition-colors shadow-sm">CANCELAR</button>
                <button type="submit" disabled={formSaving} className="flex-[2] py-6 bg-[#0f172a] text-white rounded-[28px] font-black uppercase tracking-widest shadow-2xl flex items-center justify-center gap-3 text-[11px] transition-all hover:bg-slate-800 hover:scale-[1.01] active:scale-95 disabled:opacity-50">
                  {formSaving ? 'GUARDANDO CAMBIOS...' : 'GUARDAR FICHA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// --- LocationsDashboard y resto de componentes ---
const LocationsDashboard = () => {
    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingLoc, setEditingLoc] = useState<Location | null>(null);
    const [isCreatingLoc, setIsCreatingLoc] = useState(false);
    const [locSaving, setLocSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [locFormData, setLocFormData] = useState<Partial<Location>>({});
    const [currentLocId, setCurrentLocId] = useState(localStorage.getItem('upfest_terminal_location_id'));
    
    const load = async () => { 
      setLoading(true); 
      try { 
        setLocations(await fetchLocations()); 
      } finally { 
        setLoading(false); 
      } 
    };

    useEffect(() => { load(); }, []);

    useEffect(() => {
      if (editingLoc) setLocFormData({ ...editingLoc });
      else setLocFormData({ name: '', address: '', city: '', lat: 0, lng: 0, radiusMeters: 100 });
    }, [editingLoc, isCreatingLoc]);

    const handleSaveLoc = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!locFormData.name) return alert("Nombre obligatorio");
      setLocSaving(true);
      try {
        await saveLocation(locFormData as Location);
        setSaveSuccess(true);
        setTimeout(() => {
          setSaveSuccess(false);
          setEditingLoc(null);
          setIsCreatingLoc(false);
          load();
        }, 1500);
      } catch (err: any) {
        alert("Error al guardar sede: " + err.message);
      } finally {
        setLocSaving(false);
      }
    };

    const handleDeleteLoc = async (locId: string, name: string) => {
      if (!confirm(`¿CONFIRMAS ELIMINAR LA SEDE "${name.toUpperCase()}"?`)) return;
      try {
        await deleteLocation(locId);
        load();
      } catch (err: any) {
        alert("Error al eliminar: " + err.message);
      }
    };

    const fetchCurrentGPS = async () => {
      try {
        const pos = await getCurrentPosition();
        setLocFormData({ ...locFormData, lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch (e) {
        alert("No se pudo obtener la ubicación GPS.");
      }
    };

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-8 animate-in fade-in">
            <div className="flex flex-col md:flex-row justify-between items-center mb-10 gap-4">
              <div className="text-center md:text-left">
                <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">Sedes / Salones</h1>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 italic">CONFIGURACIÓN DE GEOCERCAS</p>
              </div>
              <button onClick={() => setIsCreatingLoc(true)} className="w-full md:auto bg-slate-900 text-white px-8 py-4 rounded-2xl flex items-center justify-center gap-3 shadow-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-colors">
                <Plus size={18} /> Nueva Sede
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
              {loading ? (
                <div className="col-span-full py-20 text-center text-slate-300 font-black uppercase">Cargando sedes...</div>
              ) : locations.map(loc => (
                <div key={loc.id} className={`p-8 bg-white border rounded-[40px] shadow-sm transition-all relative group ${currentLocId === loc.id ? 'border-orange-500 ring-8 ring-orange-50' : 'border-slate-100'}`}>
                  <button onClick={() => setEditingLoc(loc)} className="absolute top-6 right-6 p-3 text-slate-300 hover:text-orange-600 transition-colors">
                    <Pencil size={18}/>
                  </button>
                  <div className={`w-16 h-16 rounded-[24px] flex items-center justify-center mb-6 ${currentLocId === loc.id ? 'bg-orange-500 text-white shadow-lg shadow-orange-100' : 'bg-slate-50 text-slate-400'}`}>
                    <Building size={24}/>
                  </div>
                  <h3 className="font-black text-2xl text-slate-900 uppercase tracking-tighter mb-2 pr-10">{loc.name}</h3>
                  <div className="space-y-2 mb-8">
                    <p className="text-xs font-bold text-slate-500 flex items-center gap-2"><MapPin size={14} className="text-slate-300"/> {loc.address || 'Sin dirección'}</p>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Navigation size={14} className="text-slate-300"/> {loc.lat.toFixed(6)}, {loc.lng.toFixed(6)}</p>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Target size={14} className="text-slate-300"/> Radio: {loc.radiusMeters}m</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { localStorage.setItem('upfest_terminal_location_id', loc.id); setCurrentLocId(loc.id); alert('Sede vinculada'); }} className={`flex-[2] py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${currentLocId === loc.id ? 'bg-emerald-50 text-white shadow-lg shadow-emerald-100' : 'bg-slate-900 text-white'}`}>
                      {currentLocId === loc.id ? 'VINCULADA' : 'VINCULAR TERMINAL'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {(isCreatingLoc || editingLoc) && (
              <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                <div className="bg-white rounded-[40px] w-full max-w-2xl shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300">
                  {saveSuccess && (
                    <div className="absolute inset-0 bg-white/95 backdrop-blur-md z-[200] flex flex-col items-center justify-center animate-in fade-in duration-300">
                      <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mb-6 animate-bounce shadow-xl border-4 border-white">
                        <Check size={48} className="text-emerald-600" />
                      </div>
                      <h3 className="text-3xl font-black uppercase tracking-tighter text-slate-900">CAMBIOS REALIZADOS</h3>
                    </div>
                  )}
                  
                  <button type="button" onClick={() => { setEditingLoc(null); setIsCreatingLoc(false); }} className="absolute top-8 right-8 p-3 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-400 transition-colors z-10"><X size={20}/></button>
                  
                  <form onSubmit={handleSaveLoc} className="p-10 space-y-8">
                    <div className="border-b pb-6">
                      <h3 className="font-black text-2xl uppercase tracking-tighter text-slate-900">
                        {editingLoc ? 'EDITAR SEDE' : 'NUEVA SEDE'}
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="col-span-full space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Nombre del Salón / Sede</label>
                        <input type="text" value={locFormData.name || ''} onChange={e => setLocFormData({...locFormData, name: e.target.value})} className="w-full p-5 bg-slate-50 rounded-[20px] font-black text-slate-900 outline-none uppercase text-sm border border-transparent focus:border-slate-200" required />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Dirección</label>
                        <input type="text" value={locFormData.address || ''} onChange={e => setLocFormData({...locFormData, address: e.target.value})} className="w-full p-5 bg-slate-50 rounded-[20px] font-black text-slate-900 outline-none text-sm border border-transparent focus:border-slate-200" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Ciudad</label>
                        <input type="text" value={locFormData.city || ''} onChange={e => setLocFormData({...locFormData, city: e.target.value})} className="w-full p-5 bg-slate-50 rounded-[20px] font-black text-slate-900 outline-none text-sm border border-transparent focus:border-slate-200" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Latitud</label>
                        <input type="number" step="any" value={locFormData.lat || 0} onChange={e => setLocFormData({...locFormData, lat: parseFloat(e.target.value)})} className="w-full p-5 bg-slate-50 rounded-[20px] font-black text-slate-900 outline-none text-sm border border-transparent focus:border-slate-200" required />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Longitud</label>
                        <input type="number" step="any" value={locFormData.lng || 0} onChange={e => setLocFormData({...locFormData, lng: parseFloat(e.target.value)})} className="w-full p-5 bg-slate-50 rounded-[20px] font-black text-slate-900 outline-none text-sm border border-transparent focus:border-slate-200" required />
                      </div>
                      <div className="col-span-full flex gap-4">
                        <div className="flex-1 space-y-2">
                          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Radio de Tolerancia (Metros)</label>
                          <input type="number" value={locFormData.radiusMeters || 100} onChange={e => setLocFormData({...locFormData, radiusMeters: parseInt(e.target.value)})} className="w-full p-5 bg-slate-50 rounded-[20px] font-black text-slate-900 outline-none text-sm border border-transparent focus:border-slate-200" required />
                        </div>
                        <div className="flex-1 pt-6">
                           <button type="button" onClick={fetchCurrentGPS} className="w-full h-full bg-orange-50 text-orange-600 border-2 border-orange-100 rounded-[20px] font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-orange-100 transition-all">
                              <Navigation size={18}/> Usar mi GPS
                           </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-4 pt-4">
                      {editingLoc && (
                        <button type="button" onClick={() => handleDeleteLoc(editingLoc.id, editingLoc.name)} className="py-5 bg-rose-50 text-rose-600 rounded-[24px] font-black uppercase tracking-widest text-[10px] px-8 hover:bg-rose-100 transition-colors">ELIMINAR</button>
                      )}
                      <button type="button" onClick={() => { setEditingLoc(null); setIsCreatingLoc(false); }} className="flex-1 py-5 bg-white border-2 border-slate-100 text-slate-400 rounded-[24px] font-black uppercase tracking-widest text-[10px] hover:bg-slate-50 transition-colors">CANCELAR</button>
                      <button type="submit" disabled={locSaving} className="flex-[2] py-5 bg-[#0f172a] text-white rounded-[24px] font-black uppercase tracking-widest text-[10px] shadow-2xl flex items-center justify-center gap-3 transition-all hover:bg-slate-800 disabled:opacity-50">
                        {locSaving ? <RefreshCw className="animate-spin" size={18}/> : 'GUARDAR SEDE'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
        </div>
    );
};

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
  const [error, setError] = useState(''); 
  const [loading, setLoading] = useState(false);
  
  const handleLogin = async (e: React.FormEvent) => { 
    e.preventDefault(); 
    setLoading(true); 
    setError('');
    try { 
      const user = await authenticateUser(dni); 
      if (user) onLogin(user); 
      else setError('DNI NO ENCONTRADO'); 
    } catch (err: any) { 
      if (err.message === "CUENTA DESACTIVADA") {
        setError("CUENTA DESACTIVADA");
      } else {
        setError('ERROR DE CONEXIÓN'); 
      }
    } 
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
          <input type="text" inputMode="numeric" value={dni} onChange={e => setDni(e.target.value)} className="w-full px-8 py-5 border border-slate-200 rounded-[20px] font-bold outline-none focus:ring-4 focus:ring-blue-500/5 transition-all bg-slate-50/50 text-slate-900" placeholder="INGRESA TU DNI" required />
          {error && <div className="text-red-500 text-[10px] font-black text-center uppercase animate-pulse">{error}</div>}
          <button type="submit" disabled={loading} className="w-full bg-slate-900 text-white font-black py-5 rounded-[20px] shadow-xl hover:bg-slate-800 transition-all disabled:opacity-50 text-sm uppercase tracking-widest">
            {loading ? 'CONECTANDO...' : 'INGRESAR'}
          </button>
        </form>
      </div>
    </div>
  );
};
