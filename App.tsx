
import React, { useState, useEffect, useRef } from 'react';
import { 
  Role, Location, User, LogEntry, WorkSchedule, Incident, ValidationResult, DEFAULT_ROLES
} from './types';
import { 
  getCurrentPosition, calculateDistance, isWithinSchedule, getScheduleDelayInfo,
  fetchUsers, fetchLocations, fetchLogs, fetchTodayLogs, fetchLogsByDateRange, addLog, saveUser, deleteUser,
  authenticateUser, saveLocation, deleteLocation, fetchCompanyLogo, saveCompanyLogo,
  fetchLastLog, updateLog, deleteLog
} from './services/utils';
import { analyzeCheckIn, generateIncidentExplanation } from './services/geminiService';
import { 
  Camera, User as UserIcon, Shield, Clock, 
  LogOut, CheckCircle, XCircle, AlertTriangle, Plus, Save, Lock, Hash, Upload, Trash2, Ban, Image as ImageIcon, Pencil, X, RotateCcw, Home, FileText, Users, Building, MapPin, Map, Eye, Menu, Settings, ChevronRight, LayoutDashboard, ArrowLeft, Calendar, Download, Search, Filter, FileSpreadsheet, File, Wallet, AlertCircle, TrendingDown, TrendingUp, Sparkles, MapPinned, RefreshCw, UserCheck, Shirt, Monitor, Activity, Maximize2, Laptop, Info, ExternalLink, FileUp
} from 'lucide-react';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// --- Helpers ---

const formatToHHMM = (isoString: string | undefined): string => {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
};

// --- Clock Module (User Side) ---

const ClockView = ({ user, onLogout }: { user: User, onLogout: () => void }) => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [deviceLocation, setDeviceLocation] = useState<Location | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastLog, setLastLog] = useState<LogEntry | null>(null);
  const [adminLogs, setAdminLogs] = useState<LogEntry[]>([]);
  const [userTodayLogs, setUserTodayLogs] = useState<LogEntry[]>([]);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [resultSummary, setResultSummary] = useState<{
    logType: 'CHECK_IN' | 'CHECK_OUT';
    isLocationValid: boolean;
    aiResult: ValidationResult;
    dist: number;
    diffMessage: string;
  } | null>(null);
  const [showFinalSuccess, setShowFinalSuccess] = useState(false);
  const [countdown, setCountdown] = useState(5);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const todayName = days[new Date().getDay()];
  const todaySchedule = user.schedule?.find(s => s.day === todayName);

  useEffect(() => {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
    const deviceLocId = localStorage.getItem('upfest_terminal_location_id');

    Promise.all([
      fetchLocations(),
      fetchLastLog(user.id),
      user.role === 'Admin' ? fetchLogs() : Promise.resolve([]),
      fetchLogsByDateRange(startOfDay, endOfDay)
    ]).then(([allLocs, last, logs, allTodayLogs]) => {
      setLocations(allLocs);
      setLastLog(last);
      setAdminLogs(logs);
      setUserTodayLogs(allTodayLogs.filter(l => l.userId === user.id));
      if (deviceLocId) {
        const found = allLocs.find(l => l.id === deviceLocId);
        if (found) setDeviceLocation(found);
      }
    });
  }, [user.id, user.role]);

  useEffect(() => {
    let timer: any;
    if (showFinalSuccess && countdown > 0) {
      timer = setInterval(() => setCountdown(prev => prev - 1), 1000);
    } else if (showFinalSuccess && countdown === 0) {
      onLogout();
    }
    return () => clearInterval(timer);
  }, [showFinalSuccess, countdown, onLogout]);

  const startCamera = async () => {
    setCameraActive(true);
    setPhoto(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (e) { alert("Error al acceder a la cámara"); }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context?.drawImage(videoRef.current, 0, 0);
      const data = canvasRef.current.toDataURL('image/jpeg');
      setPhoto(data);
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      setCameraActive(false);
    }
  };

  const calculateDiffMessage = (type: 'CHECK_IN' | 'CHECK_OUT'): string => {
    if (!todaySchedule) return "";
    const targetTime = type === 'CHECK_IN' ? todaySchedule.start : todaySchedule.end;
    if (targetTime === '--:--' || !targetTime) return "";
    const now = new Date();
    const [h, m] = targetTime.split(':').map(Number);
    const target = new Date();
    target.setHours(h, m, 0, 0);
    const diffMs = now.getTime() - target.getTime();
    const diffMins = Math.abs(Math.round(diffMs / 60000));
    if (type === 'CHECK_IN') {
      if (diffMs > 0) return `Estas fichando ${diffMins} minutos después del horario de ingreso`;
      return `Estas fichando ${diffMins} minutos antes del horario de ingreso`;
    } else {
      if (diffMs < 0) return `Estas fichando ${diffMins} minutos antes del horario de salida`;
      return `Estas fichando ${diffMins} minutos después del horario de salida`;
    }
  };

  const handleAction = async (type: 'CHECK_IN' | 'CHECK_OUT') => {
    if (!deviceLocation || !photo) return;
    setLoading(true);
    try {
      const pos = await getCurrentPosition();
      const currentDist = calculateDistance(pos.coords.latitude, pos.coords.longitude, deviceLocation.lat, deviceLocation.lng);
      const isLocationValid = currentDist <= (deviceLocation.radiusMeters || 100);
      const aiResult: ValidationResult = await analyzeCheckIn(photo, user.dressCode, user.referenceImage);
      const diffMsg = calculateDiffMessage(type);
      const log: LogEntry = {
        id: '', userId: user.id, userName: user.name, legajo: user.legajo, timestamp: new Date().toISOString(), type,
        locationId: deviceLocation.id, locationName: deviceLocation.name, locationStatus: isLocationValid ? 'VALID' : 'INVALID',
        dressCodeStatus: aiResult.dressCodeMatches ? 'PASS' : 'FAIL', identityStatus: aiResult.identityMatch ? 'MATCH' : 'NO_MATCH',
        photoEvidence: photo, aiFeedback: `${aiResult.description}. ${diffMsg}`
      };
      await addLog(log);
      setLastLog(log);
      setResultSummary({ logType: type, isLocationValid, aiResult, dist: currentDist, diffMessage: diffMsg });
    } catch (e: any) {
      alert("Error al procesar: " + (e.message || "Fallo de conexión"));
    } finally {
      setLoading(false);
    }
  };

  if (showFinalSuccess) {
    return (
      <div className="max-w-xl mx-auto p-4 md:p-12 animate-in zoom-in duration-500 flex items-center justify-center min-h-[60vh]">
        <div className="bg-white rounded-[40px] p-12 border border-slate-200 shadow-2xl text-center space-y-8 w-full">
          <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto animate-bounce">
            <CheckCircle size={48} />
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">FICHADA REGISTRADA</h2>
            <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Cargada correctamente en el sistema UpFest</p>
          </div>
          <div className="pt-4 border-t border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Cerrando sesión en {countdown} segundos...</p>
            <div className="w-full bg-slate-100 h-1 mt-4 rounded-full overflow-hidden">
               <div className="bg-emerald-500 h-full transition-all duration-1000" style={{ width: `${(countdown / 5) * 100}%` }}></div>
            </div>
          </div>
          <button onClick={onLogout} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition shadow-xl">Cerrar Ahora</button>
        </div>
      </div>
    );
  }

  if (resultSummary) {
    const hasIssues = !resultSummary.isLocationValid || !resultSummary.aiResult.identityMatch || !resultSummary.aiResult.dressCodeMatches;
    return (
      <div className="max-w-xl mx-auto p-4 md:p-12 animate-in fade-in zoom-in-95 duration-500">
        <div className="bg-white rounded-[32px] md:rounded-[40px] p-6 md:p-10 border border-slate-200 shadow-2xl shadow-slate-200/50">
          <div className="text-center mb-8 md:mb-10">
            <div className={`w-16 h-16 md:w-20 md:h-20 rounded-full mx-auto mb-6 flex items-center justify-center ${hasIssues ? 'bg-orange-100 text-orange-600' : 'bg-emerald-100 text-emerald-600'}`}>
              {hasIssues ? <AlertCircle size={32} /> : <CheckCircle size={32} />}
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter uppercase">RESUMEN DE FICHADA</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Verificación completada por UpFest AI</p>
          </div>
          <div className="space-y-4 mb-8 md:mb-10">
            <div className={`p-4 md:p-5 rounded-2xl md:rounded-3xl border flex items-center justify-between ${resultSummary.isLocationValid ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              <div className="flex items-center gap-4">
                <MapPin size={20} className={resultSummary.isLocationValid ? 'text-emerald-600' : 'text-red-600'} />
                <div>
                  <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Ubicación</span>
                  <span className={`text-xs font-bold ${resultSummary.isLocationValid ? 'text-emerald-700' : 'text-red-700'}`}>{resultSummary.isLocationValid ? 'En rango permitido' : `Fuera de rango (${Math.round(resultSummary.dist)}m)`}</span>
                </div>
              </div>
              {resultSummary.isLocationValid ? <CheckCircle size={18} className="text-emerald-600" /> : <XCircle size={18} className="text-red-600" />}
            </div>
            <div className={`p-4 md:p-5 rounded-2xl md:rounded-3xl border flex items-center justify-between ${resultSummary.aiResult.identityMatch ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              <div className="flex items-center gap-4">
                <UserCheck size={20} className={resultSummary.aiResult.identityMatch ? 'text-emerald-600' : 'text-red-600'} />
                <div><span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Rostro / Identidad</span><span className={`text-xs font-bold ${resultSummary.aiResult.identityMatch ? 'text-emerald-700' : 'text-red-700'}`}>{resultSummary.aiResult.identityMatch ? 'Persona correcta detectada' : 'No se detectó coincidencia facial'}</span></div>
              </div>
              {resultSummary.aiResult.identityMatch ? <CheckCircle size={18} className="text-emerald-600" /> : <XCircle size={18} className="text-red-600" />}
            </div>
            <div className={`p-4 md:p-5 rounded-2xl md:rounded-3xl border flex items-center justify-between ${resultSummary.aiResult.dressCodeMatches ? 'bg-emerald-50 border-emerald-100' : 'bg-orange-50 border-orange-100'}`}>
              <div className="flex items-center gap-4">
                <Shirt size={20} className={resultSummary.aiResult.dressCodeMatches ? 'text-emerald-600' : 'text-orange-600'} />
                <div><span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Vestimenta</span><span className={`text-xs font-bold ${resultSummary.aiResult.dressCodeMatches ? 'text-emerald-700' : 'text-orange-700'}`}>{resultSummary.aiResult.dressCodeMatches ? 'Código de vestimenta OK' : 'Discrepancia en vestimenta'}</span></div>
              </div>
              {resultSummary.aiResult.identityMatch ? <CheckCircle size={18} className="text-emerald-600" /> : <AlertTriangle size={18} className="text-orange-600" />}
            </div>
            <div className="bg-slate-50 p-4 md:p-6 rounded-2xl md:rounded-3xl border border-slate-100">
              <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Comentarios IA</span>
              <p className="text-xs font-bold text-slate-600 italic leading-relaxed">"{resultSummary.aiResult.description}"</p>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <button onClick={() => setShowFinalSuccess(true)} className={`w-full h-14 md:h-16 rounded-xl md:rounded-2xl font-black text-xs uppercase tracking-widest transition shadow-xl ${hasIssues ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>{hasIssues ? 'Confirmar con Incidencia y Salir' : 'Confirmar y Finalizar'}</button>
            <button onClick={() => { setResultSummary(null); setPhoto(null); }} className="w-full h-14 md:h-16 rounded-xl md:rounded-2xl font-black text-xs uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition border border-slate-100">Volver a Fichar / Reintentar</button>
          </div>
        </div>
      </div>
    );
  }

  const hasInToday = userTodayLogs.some(l => l.type === 'CHECK_IN');
  const hasOutToday = userTodayLogs.some(l => l.type === 'CHECK_OUT');
  const turnCompletedToday = hasInToday && hasOutToday;
  const isCheckInDisabled = loading || !photo || !deviceLocation || lastLog?.type === 'CHECK_IN' || turnCompletedToday;
  const isCheckOutDisabled = loading || !photo || !deviceLocation || lastLog?.type !== 'CHECK_IN';

  if (user.role === 'Admin') {
    return (
      <div className="max-w-7xl mx-auto p-4 md:p-12 space-y-8 md:space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-white rounded-[32px] md:rounded-[48px] p-6 md:p-10 border border-slate-200 shadow-sm overflow-hidden">
           <div className="flex flex-col md:flex-row items-center justify-between mb-8 md:mb-10 gap-6">
              <div className="text-center md:text-left">
                <h3 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter uppercase flex items-center justify-center md:justify-start gap-3"><Monitor className="text-orange-600" size={32} /> Monitor de Fichadas</h3>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Sincronización en tiempo real del personal</p>
              </div>
              <div className="flex items-center gap-2 bg-emerald-50 px-6 py-3 rounded-full border border-emerald-100">
                <span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span></span>
                <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Estado: Online</span>
              </div>
           </div>
           <div className="overflow-x-auto -mx-6 md:mx-0 rounded-none md:rounded-[32px] border-x-0 md:border border-slate-100 bg-slate-50/50">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="p-4 md:p-6 text-[10px] font-black uppercase tracking-widest w-24 text-center">Evidencia</th>
                    <th className="p-4 md:p-6 text-[10px] font-black uppercase tracking-widest">Colaborador</th>
                    <th className="p-4 md:p-6 text-[10px] font-black uppercase tracking-widest text-center">Acción</th>
                    <th className="p-4 md:p-6 text-[10px] font-black uppercase tracking-widest text-center">Hora</th>
                    <th className="p-4 md:p-6 text-[10px] font-black uppercase tracking-widest">Ubicación</th>
                    <th className="p-4 md:p-6 text-[10px] font-black uppercase tracking-widest">Validación AI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {adminLogs.length === 0 ? (<tr><td colSpan={6} className="p-20 text-center text-slate-400 font-bold italic">No hay registros recientes para mostrar.</td></tr>) : adminLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-white transition-colors group">
                      <td className="p-4"><div onClick={() => log.photoEvidence && setZoomedImage(log.photoEvidence)} className="relative w-12 h-12 md:w-16 md:h-16 mx-auto rounded-xl md:rounded-2xl overflow-hidden cursor-zoom-in border-2 border-white shadow-sm hover:scale-105 transition-transform">{log.photoEvidence ? (<><img src={log.photoEvidence} className="w-full h-full object-cover" /><div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"><Maximize2 size={16} className="text-white" /></div></>) : <UserIcon className="m-auto mt-2 md:mt-4 text-slate-300" />}</div></td>
                      <td className="p-4 md:p-6"><div className="flex flex-col"><span className="font-black text-slate-900 uppercase tracking-tight text-sm md:text-base">{log.userName}</span><span className="text-[9px] font-black text-slate-400">Legajo: {log.legajo || 'N/A'}</span></div></td>
                      <td className="p-4 md:p-6 text-center"><span className={`inline-block px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-tighter ${log.type === 'CHECK_IN' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-slate-200 text-slate-700 border border-slate-300'}`}>{log.type === 'CHECK_IN' ? 'INGRESO' : 'EGRESO'}</span></td>
                      <td className="p-4 md:p-6 text-center text-xs font-black text-slate-900 tabular-nums">{new Date(log.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                      <td className="p-4 md:p-6"><div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600"><MapPin size={12} className="text-slate-400" />{log.locationName}</div></td>
                      <td className="p-4 md:p-6 max-w-xs"><div className="flex flex-col gap-1.5"><div className="flex gap-2"><span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${log.identityStatus === 'MATCH' ? 'bg-emerald-500' : 'bg-red-500'}`} title="Identidad"></span><span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${log.dressCodeStatus === 'PASS' ? 'bg-emerald-500' : 'bg-orange-500'}`} title="Vestimenta"></span><span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${log.locationStatus === 'VALID' ? 'bg-emerald-500' : 'bg-red-500'}`} title="Ubicación"></span></div><p className="text-[10px] italic text-slate-500 leading-tight line-clamp-2">"{log.aiFeedback}"</p></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
           </div>
        </div>
        {zoomedImage && (<div className="fixed inset-0 z-[200] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-300" onClick={() => setZoomedImage(null)}><button className="absolute top-4 right-4 md:top-8 md:right-8 text-white hover:scale-110 transition"><X className="w-8 h-8 md:w-12 md:h-12" /></button><img src={zoomedImage} className="max-w-full max-h-full rounded-2xl md:rounded-[40px] shadow-2xl border-2 md:border-4 border-white animate-in zoom-in-95 duration-300" /></div>)}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-12 space-y-8 md:space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="max-w-xl mx-auto w-full">
        {!deviceLocation ? (<div className="bg-white rounded-[32px] md:rounded-[40px] p-8 md:p-12 border border-orange-200 shadow-xl text-center space-y-6"><div className="w-16 h-16 md:w-20 md:h-20 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto"><Laptop size={32} /></div><h3 className="text-xl md:text-2xl font-black text-slate-900 tracking-tighter uppercase">TERMINAL NO CONFIGURADA</h3><p className="text-sm md:text-base text-slate-500 font-bold leading-relaxed">Este dispositivo aún no ha sido asignado a un Salón de UpFest.<br/>Un administrador debe configurar esta terminal desde el panel de Sedes.</p><button onClick={onLogout} className="w-full bg-slate-900 text-white py-4 md:py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl">Cerrar Sesión</button></div>) : (
          <div className="bg-white rounded-[32px] md:rounded-[40px] p-6 md:p-10 border border-slate-200 shadow-xl shadow-slate-200/50">
            <div className="flex items-center justify-between mb-8 pb-8 border-b border-slate-100">
              <div className="flex items-center gap-4 md:gap-6"><div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl md:rounded-3xl bg-slate-900 flex items-center justify-center text-white shadow-2xl shadow-slate-900/20 overflow-hidden border-2 md:border-4 border-white shrink-0">{user.referenceImage ? <img src={user.referenceImage} className="w-full h-full object-cover" /> : <UserIcon size={32} />}</div><div><h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tighter uppercase line-clamp-1">{user.name}</h2><div className="flex flex-wrap items-center gap-2 mt-1"><span className="text-[8px] md:text-[10px] font-black bg-orange-100 text-orange-700 px-2 md:px-3 py-1 rounded-full uppercase tracking-widest">DNI: {user.dni}</span><span className="text-[8px] md:text-[10px] font-black bg-slate-100 text-slate-400 px-2 md:px-3 py-1 rounded-full uppercase tracking-widest">{user.role}</span></div></div></div>
              <div className="text-right hidden sm:block"><span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Ubicación Terminal</span><div className="flex items-center justify-end gap-1.5 text-orange-600 font-black text-xs uppercase"><MapPinned size={14} />{deviceLocation.name}</div></div>
            </div>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4"><div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-slate-900"><span className="block text-[8px] font-black text-slate-600 uppercase tracking-widest">Inicio Hoy</span><span className="text-xs font-black">{todaySchedule?.start || '--:--'}</span></div><div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-slate-900"><span className="block text-[8px] font-black text-slate-600 uppercase tracking-widest">Fin Hoy</span><span className="text-xs font-black">{todaySchedule?.end || '--:--'}</span></div></div>
              <div className="relative aspect-square rounded-[24px] md:rounded-[32px] overflow-hidden bg-slate-900 shadow-inner group">{!cameraActive && !photo && (<button onClick={startCamera} className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3 hover:bg-slate-800 transition"><div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20"><Camera size={28} /></div><span className="text-[10px] font-black uppercase tracking-[0.2em]">Activar Cámara</span></button>)}{cameraActive && (<><video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover scale-x-[-1]" /><button onClick={capturePhoto} className="absolute bottom-8 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full bg-white border-8 border-white/30 shadow-2xl active:scale-95 transition" /></>)}{photo && (<><img src={photo} className="w-full h-full object-cover" /><button onClick={() => setPhoto(null)} className="absolute top-4 right-4 p-3 bg-white/20 backdrop-blur-md text-white rounded-2xl hover:bg-white/40 transition"><RotateCcw size={20} /></button></>)}<canvas ref={canvasRef} className="hidden" /></div>
              <div className="space-y-4">{turnCompletedToday && (<div className="bg-emerald-50 p-5 md:p-6 rounded-2xl border border-emerald-100 space-y-3"><div className="flex items-center gap-3"><CheckCircle className="text-emerald-500" size={24} /><h4 className="font-black text-emerald-800 text-sm tracking-tight uppercase">TURNO DE HOY COMPLETADO</h4></div><p className="text-[10px] font-bold text-emerald-600 leading-relaxed uppercase tracking-widest">Ya has registrado tus fichadas de entrada y salida para esta jornada.</p></div>)}{!turnCompletedToday && lastLog?.type === 'CHECK_IN' && (<div className="bg-orange-50 p-4 rounded-2xl border border-orange-100 flex items-center gap-3"><AlertTriangle className="text-orange-500" size={16} /><span className="text-[10px] font-bold text-orange-700">Tienes un ingreso activo en {lastLog.locationName}. Debes marcar salida antes de otro ingreso.</span></div>)}</div>
              <div className="flex gap-4">
                <button onClick={() => handleAction('CHECK_IN')} disabled={isCheckInDisabled} className="flex-1 bg-slate-900 text-white h-16 md:h-20 rounded-[20px] md:rounded-[28px] font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-slate-900/20 disabled:opacity-20 flex flex-col items-center justify-center transition-all hover:translate-y-[-2px]">{loading ? <RefreshCw className="animate-spin" size={20}/> : <><Clock size={20} className="mb-1"/> Ingreso</>}{lastLog?.type === 'CHECK_IN' && <span className="text-[8px] opacity-60">Activo</span>}</button>
                <button onClick={() => handleAction('CHECK_OUT')} disabled={isCheckOutDisabled} className="flex-1 bg-white border-2 border-slate-100 text-slate-900 h-16 md:h-20 rounded-[20px] md:rounded-[28px] font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-slate-200/50 disabled:opacity-20 flex flex-col items-center justify-center transition-all hover:translate-y-[-2px]">{loading ? <RefreshCw className="animate-spin" size={20}/> : <><LogOut size={20} className="mb-1"/> Egreso</>}</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <p className="text-center text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">UpFest Control Biométrico v4.7 - Kiosk Mode</p>
    </div>
  );
};

// --- Dashboard Personal ---

const AdminDashboard = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [importingExcel, setImportingExcel] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);

  // Form State
  const [formData, setFormData] = useState<Partial<User>>({});
  const [formSaving, setFormSaving] = useState(false);

  const load = async () => { 
    setLoading(true); 
    try { 
      const [u, l] = await Promise.all([fetchUsers(), fetchLocations()]); 
      setUsers(u); setLocations(l);
    } catch(e) { console.error(e); } finally { setLoading(false); } 
  };
  
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (editingUser) {
      setFormData(editingUser);
    } else {
      setFormData({
        role: 'Mozo',
        schedule: [],
        assignedLocations: []
      });
    }
  }, [editingUser, isCreating]);

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.dni) return alert("Nombre y DNI son obligatorios");
    setFormSaving(true);
    try {
      await saveUser(formData as User);
      setEditingUser(null);
      setIsCreating(false);
      load();
    } catch (error: any) {
      alert("Error al guardar: " + error.message);
    } finally {
      setFormSaving(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, referenceImage: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const downloadExcelTemplate = () => {
    const headers = [
      "ID Nomina", "Nombre y Apellido", "DNI", "Puesto o Rol que cumple", 
      "Vestimenta obligatoria del puesto (ejemplo: camisa blanco, pantalon negro, etc)", 
      "Fecha de ingreso", "Tipo de trabajo", "En que sucursal trabajas?", 
      "Correo electrónico", "Dirección", "Número de teléfono", "Contraseña"
    ];
    const example = [
      "LEG001", "Juan Perez", "12345678", "Mozo", "Chomba blanca, pantalon negro", 
      "2023-01-15", "Efectivo", "Sede Central", "juan@mail.com", "Calle 123", "1122334455", "1234"
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Nomina");
    XLSX.writeFile(wb, "Plantilla_Nomina_UpFest.xlsx");
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingExcel(true);
    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws) as any[];
        let count = 0;
        for (const row of data) {
          const sucName = row["En que sucursal trabajas?"];
          const matchedLoc = locations.find(l => l.name.toLowerCase() === String(sucName || '').toLowerCase());
          const newUser: User = {
            id: '',
            legajo: String(row["ID Nomina"] || ''),
            name: row["Nombre y Apellido"] || '',
            dni: String(row["DNI"] || ''),
            role: row["Puesto o Rol que cumple"] || 'Mozo',
            dressCode: row["Vestimenta obligatoria del puesto (ejemplo: camisa blanco, pantalon negro, etc)"] || '',
            hireDate: row["Fecha de ingreso"] || '',
            workType: row["Tipo de trabajo"] || '',
            email: row["Correo electrónico"] || '',
            address: row["Dirección"] || '',
            phone: String(row["Número de teléfono"] || ''),
            password: String(row["Contraseña"] || '1234'),
            schedule: [],
            referenceImage: null,
            assignedLocations: matchedLoc ? [matchedLoc.id] : []
          };
          if (newUser.name && newUser.dni) { await saveUser(newUser); count++; }
        }
        alert(`Importación exitosa: ${count} colaboradores registrados.`);
        load();
      };
      reader.readAsBinaryString(file);
    } catch (error) { alert("Error al procesar Excel"); } finally { setImportingExcel(false); e.target.value = ''; }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter uppercase">Personal UpFest</h1>
            <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-1">Gestión de RRHH y Biometría</p>
          </div>
          <div className="flex flex-wrap gap-3 w-full md:w-auto">
            <button onClick={downloadExcelTemplate} className="flex-1 md:flex-none bg-white border border-slate-200 text-slate-600 px-5 py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-slate-50 transition font-black text-[10px] uppercase tracking-widest"><Download size={16}/> Plantilla</button>
            <label className="cursor-pointer flex-1 md:flex-none bg-emerald-600 text-white px-6 py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-emerald-700 transition shadow-xl font-black text-[10px] uppercase tracking-widest">
                {importingExcel ? <RefreshCw className="animate-spin" size={18}/> : <FileUp size={18} />} Subir Nómina
                <input type="file" accept=".xlsx, .xls" onChange={handleExcelImport} className="hidden" disabled={importingExcel} />
            </label>
            <button onClick={() => setIsCreating(true)} className="flex-1 md:flex-none bg-slate-900 text-white px-6 py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-slate-800 transition shadow-xl font-black text-[10px] uppercase tracking-widest"><Plus size={18} /> Nuevo</button>
          </div>
      </div>
      <div className="bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-sm">
         <div className="overflow-x-auto"><table className="w-full text-left border-collapse min-w-[600px]"><thead><tr className="bg-slate-50 border-b border-slate-200"><th className="p-4 md:p-6 text-[10px] font-black text-slate-900 uppercase tracking-widest">Colaborador</th><th className="p-4 md:p-6 text-[10px] font-black text-slate-900 uppercase tracking-widest">Legajo / DNI</th><th className="p-4 md:p-6 text-[10px] font-black text-slate-900 uppercase tracking-widest text-center">Rol</th><th className="p-4 md:p-6 text-[10px] font-black text-slate-900 uppercase tracking-widest text-right">Acciones</th></tr></thead><tbody className="divide-y divide-slate-100">{loading ? (<tr><td colSpan={4} className="p-16 text-center text-slate-400 font-bold italic">Cargando nómina...</td></tr>) : users.length === 0 ? (<tr><td colSpan={4} className="p-16 text-center text-slate-400 font-bold italic">No hay registros.</td></tr>) : users.map(u => (<tr key={u.id} className="hover:bg-slate-50 transition-colors"><td className="p-4 md:p-6"><div className="flex items-center gap-4"><div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-slate-100 overflow-hidden border border-slate-200 shrink-0 shadow-sm">{u.referenceImage ? <img src={u.referenceImage} className="w-full h-full object-cover" /> : <UserIcon size={18} className="m-auto mt-2.5 md:mt-3 text-slate-300"/>}</div><div><span className="font-black text-slate-800 block tracking-tight text-sm md:text-base">{u.name}</span><span className="text-[9px] text-slate-400 font-black uppercase tracking-wider">{u.role}</span></div></div></td><td className="p-4 md:p-6 text-xs font-mono font-bold text-slate-900 tracking-tighter">ID: {u.legajo || 'N/A'}<br/><span className="text-[9px] text-slate-400">DNI: {u.dni}</span></td><td className="p-4 md:p-6 text-center text-[9px] md:text-[10px] font-black text-slate-900 uppercase">{u.role}</td><td className="p-4 md:p-6 text-right"><div className="flex justify-end gap-1"><button onClick={() => setEditingUser(u)} className="p-2 text-slate-400 hover:text-orange-600 rounded-xl transition"><Pencil size={16}/></button><button onClick={async () => { if(confirm('¿Eliminar?')) { await deleteUser(u.id); load(); } }} className="p-2 text-slate-400 hover:text-red-600 rounded-xl transition"><Trash2 size={16}/></button></div></td></tr>))}</tbody></table></div>
      </div>
      {(isCreating || editingUser) && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-2 overflow-y-auto py-10">
            <div className="bg-white rounded-[40px] p-6 md:p-10 w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200 my-auto">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="font-black text-2xl text-slate-900 tracking-tighter uppercase">{editingUser ? 'EDITAR COLABORADOR' : 'NUEVO COLABORADOR'}</h3>
                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Ficha de RRHH - UpFest Systems</p>
                </div>
                <button onClick={() => { setEditingUser(null); setIsCreating(false); }} className="p-2 bg-slate-50 text-slate-400 hover:text-slate-600 rounded-full"><X/></button>
              </div>
              
              <form onSubmit={handleSaveUser} className="space-y-6">
                <div className="flex flex-col md:flex-row gap-8">
                  {/* Foto de Referencia */}
                  <div className="w-full md:w-40 shrink-0">
                    <label className="text-[10px] font-black uppercase text-slate-400 block mb-2">Foto Referencia</label>
                    <div className="relative aspect-square rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden group">
                      {formData.referenceImage ? (
                        <img src={formData.referenceImage} className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="text-slate-300" size={32} />
                      )}
                      <label className="absolute inset-0 cursor-pointer bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Upload className="text-white" size={20} />
                        <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                      </label>
                    </div>
                  </div>

                  {/* Datos Básicos */}
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1 col-span-full">
                      <label className="text-[10px] font-black uppercase text-slate-400 block ml-2">Nombre Completo</label>
                      <input type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-orange-500/5" placeholder="Ej: Juan Perez" required />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 block ml-2">DNI</label>
                      <input type="text" value={formData.dni || ''} onChange={e => setFormData({...formData, dni: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-orange-500/5" placeholder="Documento" required />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 block ml-2">Legajo / ID</label>
                      <input type="text" value={formData.legajo || ''} onChange={e => setFormData({...formData, legajo: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-orange-500/5" placeholder="ID Interno" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 block ml-2">Contraseña</label>
                      <input type="text" value={formData.password || ''} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-orange-500/5" placeholder="Clave acceso" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 block ml-2">Rol / Puesto</label>
                      <select value={formData.role || 'Mozo'} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-orange-500/5 appearance-none">
                        {DEFAULT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 block ml-2 flex items-center gap-2"><Shirt size={14}/> Código de Vestimenta</label>
                    <textarea value={formData.dressCode || ''} onChange={e => setFormData({...formData, dressCode: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-orange-500/5 h-24 resize-none" placeholder="Ej: Camisa negra, delantal bordeaux, zapato negro..." />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 block ml-2 flex items-center gap-2"><MapPin size={14}/> Sedes Asignadas</label>
                    <div className="h-24 overflow-y-auto p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-1">
                      {locations.map(loc => (
                        <label key={loc.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 p-1 rounded transition-colors">
                          <input type="checkbox" checked={formData.assignedLocations?.includes(loc.id)} onChange={e => {
                            const current = formData.assignedLocations || [];
                            const next = e.target.checked ? [...current, loc.id] : current.filter(id => id !== loc.id);
                            setFormData({...formData, assignedLocations: next});
                          }} className="rounded-md border-slate-300 text-orange-600 focus:ring-orange-500" />
                          <span className="text-xs font-bold text-slate-700">{loc.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 pt-6">
                  <button type="button" onClick={() => { setEditingUser(null); setIsCreating(false); }} className="flex-1 py-4 px-6 border border-slate-200 text-slate-400 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition">Cancelar</button>
                  <button type="submit" disabled={formSaving} className="flex-[2] py-4 px-6 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition shadow-xl shadow-slate-900/20 flex items-center justify-center gap-2">
                    {formSaving ? <RefreshCw className="animate-spin" size={16}/> : <Save size={16}/>} 
                    {editingUser ? 'GUARDAR CAMBIOS' : 'CREAR COLABORADOR'}
                  </button>
                </div>
              </form>
            </div>
          </div>
      )}
    </div>
  );
};

// --- Dashboard Salones ---
const LocationsDashboard = () => {
    const [locations, setLocations] = useState<Location[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [loading, setLoading] = useState(true);
    const [currentDeviceLocId, setCurrentDeviceLocId] = useState<string | null>(localStorage.getItem('upfest_terminal_location_id'));
    const load = async () => { setLoading(true); try { setLocations(await fetchLocations()); } finally { setLoading(false); } };
    useEffect(() => { load(); }, []);
    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4"><div><h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter">SALONES</h1><p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-1">Sedes UpFest & Geocercas</p></div><button onClick={() => setIsCreating(true)} className="w-full md:w-auto bg-slate-900 text-white px-6 py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-slate-800 transition shadow-xl font-black text-[10px] uppercase tracking-widest"><Plus size={18} /> Nuevo Salón</button></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">{loading ? (<div className="col-span-full py-20 text-center text-slate-400 font-bold uppercase text-xs">Cargando sedes...</div>) : locations.map(loc => (<div key={loc.id} className={`relative bg-white rounded-[32px] p-8 border ${currentDeviceLocId === loc.id ? 'border-orange-500 ring-4 ring-orange-500/10' : 'border-slate-200'} shadow-sm flex flex-col`}>{currentDeviceLocId === loc.id && (<div className="absolute top-4 right-4 bg-orange-500 text-white px-3 py-1 rounded-full text-[8px] font-black uppercase flex items-center gap-1.5 shadow-lg"><Laptop size={10}/> Activa</div>)}<div className="p-4 bg-orange-50 text-orange-600 rounded-2xl w-fit mb-4"><MapPinned size={28} /></div><h3 className="font-black text-slate-900 text-xl mb-2 tracking-tighter">{loc.name}</h3><p className="text-xs text-slate-500 mb-6 font-bold leading-relaxed">{loc.address}</p><div className="mt-auto pt-6 border-t flex gap-2">{currentDeviceLocId !== loc.id && (<button onClick={() => {localStorage.setItem('upfest_terminal_location_id', loc.id); setCurrentDeviceLocId(loc.id);}} className="flex-1 bg-slate-900 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest">Vincular</button>)}<button onClick={async () => {if(confirm('¿Eliminar?')) {await deleteLocation(loc.id); load();}}} className="p-3 bg-slate-100 text-slate-500 rounded-xl transition"><Trash2 size={16}/></button></div></div>))}</div>
        </div>
    );
};

// --- Módulo Liquidaciones ---
const PayrollDashboard = () => {
    const [payrollItems, setPayrollItems] = useState<any[]>([]);
    const [dates, setDates] = useState({start: new Date().toISOString().split('T')[0], end: new Date().toISOString().split('T')[0]});
    const [loading, setLoading] = useState(false);
    const loadPayroll = async () => {
        setLoading(true);
        try {
            const [users, logs] = await Promise.all([fetchUsers(), fetchLogsByDateRange(new Date(dates.start), new Date(dates.end + 'T23:59:59'))]);
            const items = logs.map(l => ({ ...l, userName: l.userName, date: l.timestamp.split('T')[0], time: formatToHHMM(l.timestamp) }));
            setPayrollItems(items);
        } finally { setLoading(false); }
    };
    useEffect(() => { loadPayroll(); }, []);
    return (
        <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
            <div className="flex flex-col md:flex-row justify-between mb-8 gap-4"><div><h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter uppercase">Liquidaciones</h1><p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-1">Auditoría de Asistencia</p></div><div className="flex gap-2"><button onClick={() => {}} className="bg-slate-900 text-white px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2"><FileText size={16}/> Exportar PDF</button></div></div>
            <div className="bg-white rounded-[32px] p-8 mb-8 border border-slate-200 flex flex-wrap gap-4 items-end"><div className="flex-1 min-w-[200px]"><label className="text-[9px] font-black uppercase mb-1 block">Desde</label><input type="date" value={dates.start} onChange={e => setDates({...dates, start: e.target.value})} className="w-full p-4 bg-slate-50 rounded-xl border border-slate-100 text-xs font-black" /></div><div className="flex-1 min-w-[200px]"><label className="text-[9px] font-black uppercase mb-1 block">Hasta</label><input type="date" value={dates.end} onChange={e => setDates({...dates, end: e.target.value})} className="w-full p-4 bg-slate-50 rounded-xl border border-slate-100 text-xs font-black" /></div><button onClick={loadPayroll} className="bg-orange-600 text-white px-10 py-4 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-orange-700 transition">Consultar</button></div>
            <div className="bg-white rounded-[32px] border border-slate-200 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-slate-50 text-[9px] font-black uppercase text-slate-400"><tr className="border-b"><th className="p-6">Fecha</th><th className="p-6">Nombre</th><th className="p-6">Tipo</th><th className="p-6">Hora</th><th className="p-6">Sede</th><th className="p-6">Resultado AI</th></tr></thead><tbody className="divide-y divide-slate-100">{payrollItems.map((item, idx) => (<tr key={idx} className="hover:bg-slate-50"><td className="p-6 text-xs font-bold">{item.date}</td><td className="p-6 font-black text-slate-800">{item.userName}</td><td className="p-6"><span className={`px-2 py-1 rounded-full text-[8px] font-black border ${item.type === 'CHECK_IN' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{item.type === 'CHECK_IN' ? 'INGRESO' : 'EGRESO'}</span></td><td className="p-6 font-mono text-xs font-black">{item.time}</td><td className="p-6 text-[10px] font-bold text-slate-500">{item.locationName}</td><td className="p-6 text-[9px] italic text-slate-400 line-clamp-1">"{item.aiFeedback}"</td></tr>))}</tbody></table></div></div>
        </div>
    );
};

// --- Sidebar ---
const Sidebar = ({ activeTab, setActiveTab, currentUser, onLogout, logoUrl, isMobileMenuOpen, setIsMobileMenuOpen }: any) => {
  const NavButton = ({ tab, icon: Icon, label }: any) => (<button onClick={() => { setActiveTab(tab); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-4 px-6 py-4 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition ${activeTab === tab ? 'bg-orange-50 text-orange-700' : 'text-slate-400 hover:bg-slate-50'}`}><Icon size={20}/> {label}</button>);
  return (<><aside className={`fixed inset-y-0 left-0 z-[100] w-72 bg-white border-r border-slate-200 transform transition-transform duration-300 md:translate-x-0 md:static h-screen flex flex-col ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}><div className="p-10 border-b flex flex-col items-center">{logoUrl ? <img src={logoUrl} className="h-16 mb-4 object-contain" /> : <div className="w-16 h-16 bg-slate-900 text-white rounded-[24px] flex items-center justify-center font-black text-2xl mb-4">UP</div>}<span className="font-black text-slate-900 tracking-tighter text-2xl">UPFEST</span></div><nav className="flex-1 p-8 space-y-2 overflow-y-auto"><NavButton tab="clock" icon={Clock} label={currentUser.role === 'Admin' ? 'Monitor' : 'Fichadas'} />{currentUser.role === 'Admin' && (<><NavButton tab="payroll" icon={Wallet} label="Liquidaciones" /><NavButton tab="admin" icon={Users} label="Personal" /><NavButton tab="locations" icon={Building} label="Salones" /></>)}</nav><div className="p-8 border-t"><button onClick={onLogout} className="w-full flex items-center gap-4 px-6 py-4 rounded-[20px] text-[10px] font-black uppercase tracking-widest text-red-400 hover:bg-red-50 transition"><LogOut size={20} /> Salir</button></div></aside></>);
};

// --- Main App ---
export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('clock');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  useEffect(() => { fetchCompanyLogo().then(setLogoUrl); }, []);
  if (!currentUser) return <LoginView onLogin={u => { setCurrentUser(u); setActiveTab(u.role === 'Admin' ? 'clock' : 'clock'); }} logoUrl={logoUrl} />;
  return (<div className="min-h-screen bg-slate-50 flex flex-col md:flex-row overflow-hidden text-slate-900"><Sidebar activeTab={activeTab} setActiveTab={setActiveTab} currentUser={currentUser} onLogout={() => setCurrentUser(null)} logoUrl={logoUrl} isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen}/><div className="flex-1 flex flex-col h-screen overflow-hidden"><header className="md:hidden bg-white border-b px-6 py-4 flex items-center justify-between z-40 shadow-sm shrink-0"><button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-slate-900"><Menu size={24}/></button><span className="font-black text-slate-900 text-lg">UPFEST</span><div className="w-10"></div></header><main className="flex-1 overflow-y-auto">{activeTab === 'clock' && <ClockView user={currentUser} onLogout={() => setCurrentUser(null)} />}{activeTab === 'payroll' && <PayrollDashboard />}{activeTab === 'admin' && <AdminDashboard />}{activeTab === 'locations' && <LocationsDashboard />}</main></div></div>);
}

const LoginView = ({ onLogin, logoUrl }: any) => {
  const [dni, setDni] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const handleLogin = async (e: any) => {
    e.preventDefault(); setLoading(true); setError('');
    try { const user = await authenticateUser(dni, password); if (user) onLogin(user); else setError('DNI O CONTRASEÑA INCORRECTOS'); } catch (e) { setError('ERROR DE CONEXIÓN'); } finally { setLoading(false); }
  };
  return (<div className="min-h-screen flex items-center justify-center p-6 bg-slate-50"><div className="w-full max-w-sm bg-white rounded-[48px] shadow-2xl p-14 space-y-12 border border-slate-100 relative overflow-hidden"><div className="absolute top-0 left-0 w-full h-2 bg-orange-600"></div><div className="text-center">{logoUrl ? <img src={logoUrl} className="h-20 mx-auto mb-8 object-contain" /> : <div className="w-24 h-24 bg-slate-900 rounded-[32px] flex items-center justify-center mx-auto mb-8 text-white font-black text-4xl shadow-2xl">UP</div>}<h2 className="text-4xl font-black text-slate-900 tracking-tighter mb-2 uppercase">ENTRAR</h2><p className="text-slate-400 font-black text-[10px] uppercase tracking-[0.3em]">Control de Asistencia</p></div><form onSubmit={handleLogin} className="space-y-6"><div className="space-y-2"><label className="text-[10px] font-black text-slate-900 uppercase tracking-widest ml-4">Tu Identificador</label><input type="text" value={dni} onChange={e => setDni(e.target.value)} className="w-full px-8 py-6 bg-white border border-slate-200 rounded-[24px] focus:ring-8 focus:ring-orange-500/5 outline-none font-extrabold text-lg shadow-inner text-slate-900" placeholder="DNI o Legajo" required /></div><div className="space-y-2"><label className="text-[10px] font-black text-slate-900 uppercase tracking-widest ml-4">Contraseña</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-8 py-6 bg-white border border-slate-200 rounded-[24px] focus:ring-8 focus:ring-orange-500/5 outline-none font-extrabold text-lg shadow-inner text-slate-900" placeholder="••••••••" required /></div>{error && <div className="text-red-500 text-[10px] text-center font-black bg-red-50 p-4 rounded-[20px] border border-red-100 uppercase tracking-widest">{error}</div>}<button type="submit" disabled={loading} className={`w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-6 rounded-[24px] transition-all transform hover:scale-[1.02] shadow-2xl uppercase tracking-widest text-xs ${loading ? 'opacity-50' : ''}`}>{loading ? 'Sincronizando...' : 'ACCEDER'}</button></form></div></div>);
};
