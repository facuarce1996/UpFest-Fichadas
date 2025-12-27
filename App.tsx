
import React, { useState, useEffect, useRef } from 'react';
import { 
  Role, Location, User, LogEntry, WorkSchedule, Incident, ValidationResult
} from './types';
import { 
  getCurrentPosition, calculateDistance, isWithinSchedule, getScheduleDelayInfo,
  fetchUsers, fetchLocations, fetchLogs, fetchTodayLogs, fetchLogsByDateRange, addLog, saveUser, deleteUser,
  authenticateUser, saveLocation, deleteLocation, fetchCompanyLogo, saveCompanyLogo,
  fetchIncidents, saveIncident, deleteIncident, fetchLastLog
} from './services/utils';
import { analyzeCheckIn, generateIncidentExplanation } from './services/geminiService';
import { 
  Camera, User as UserIcon, Shield, Clock, 
  LogOut, CheckCircle, XCircle, AlertTriangle, Plus, Save, Lock, Hash, Upload, Trash2, Ban, Image as ImageIcon, Pencil, X, RotateCcw, Home, FileText, Users, Building, MapPin, Map, Eye, Menu, Settings, ChevronRight, LayoutDashboard, ArrowLeft, Calendar, Download, Search, Filter, FileSpreadsheet, File, Wallet, AlertCircle, TrendingDown, TrendingUp, Sparkles, MapPinned, RefreshCw, UserCheck, Shirt, Monitor, Activity, Maximize2, Laptop
} from 'lucide-react';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';

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
      user.role === Role.ADMIN ? fetchLogs() : Promise.resolve([]),
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
        id: '',
        userId: user.id,
        userName: user.name,
        legajo: user.legajo,
        timestamp: new Date().toISOString(),
        type,
        locationId: deviceLocation.id,
        locationName: deviceLocation.name,
        locationStatus: isLocationValid ? 'VALID' : 'INVALID',
        dressCodeStatus: aiResult.dressCodeMatches ? 'PASS' : 'FAIL',
        identityStatus: aiResult.identityMatch ? 'MATCH' : 'NO_MATCH',
        photoEvidence: photo,
        aiFeedback: `${aiResult.description}. ${diffMsg}`
      };

      await addLog(log);
      setLastLog(log);

      setResultSummary({
        logType: type,
        isLocationValid,
        aiResult,
        dist: currentDist,
        diffMessage: diffMsg
      });

    } catch (e: any) {
      alert("Error al procesar: " + (e.message || "Fallo de conexión"));
    } finally {
      setLoading(false);
    }
  };

  if (resultSummary) {
    const hasIssues = !resultSummary.isLocationValid || !resultSummary.aiResult.identityMatch || !resultSummary.aiResult.dressCodeMatches;

    return (
      <div className="max-w-xl mx-auto p-6 md:p-12 animate-in fade-in zoom-in-95 duration-500">
        <div className="bg-white rounded-[40px] p-10 border border-slate-200 shadow-2xl shadow-slate-200/50">
          <div className="text-center mb-10">
            <div className={`w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center ${hasIssues ? 'bg-orange-100 text-orange-600' : 'bg-emerald-100 text-emerald-600'}`}>
              {hasIssues ? <AlertCircle size={40} /> : <CheckCircle size={40} />}
            </div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">RESUMEN DE FICHADA</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Verificación completada por UpFest AI</p>
          </div>

          <div className="space-y-4 mb-10">
            <div className={`p-5 rounded-3xl border flex items-center justify-between ${resultSummary.isLocationValid ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              <div className="flex items-center gap-4">
                <MapPin size={20} className={resultSummary.isLocationValid ? 'text-emerald-600' : 'text-red-600'} />
                <div>
                  <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Ubicación</span>
                  <span className={`text-xs font-bold ${resultSummary.isLocationValid ? 'text-emerald-700' : 'text-red-700'}`}>
                    {resultSummary.isLocationValid ? 'En rango permitido' : `Fuera de rango (${Math.round(resultSummary.dist)}m)`}
                  </span>
                </div>
              </div>
              {resultSummary.isLocationValid ? <CheckCircle size={18} className="text-emerald-600" /> : <XCircle size={18} className="text-red-600" />}
            </div>

            <div className={`p-5 rounded-3xl border flex items-center justify-between ${resultSummary.aiResult.identityMatch ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              <div className="flex items-center gap-4">
                <UserCheck size={20} className={resultSummary.aiResult.identityMatch ? 'text-emerald-600' : 'text-red-600'} />
                <div>
                  <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Rostro / Identidad</span>
                  <span className={`text-xs font-bold ${resultSummary.aiResult.identityMatch ? 'text-emerald-700' : 'text-red-700'}`}>
                    {resultSummary.aiResult.identityMatch ? 'Persona correcta detectada' : 'No se detectó coincidencia facial'}
                  </span>
                </div>
              </div>
              {resultSummary.aiResult.identityMatch ? <CheckCircle size={18} className="text-emerald-600" /> : <XCircle size={18} className="text-red-600" />}
            </div>

            <div className={`p-5 rounded-3xl border flex items-center justify-between ${resultSummary.aiResult.dressCodeMatches ? 'bg-emerald-50 border-emerald-100' : 'bg-orange-50 border-orange-100'}`}>
              <div className="flex items-center gap-4">
                <Shirt size={20} className={resultSummary.aiResult.dressCodeMatches ? 'text-emerald-600' : 'text-orange-600'} />
                <div>
                  <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Vestimenta</span>
                  <span className={`text-xs font-bold ${resultSummary.aiResult.dressCodeMatches ? 'text-emerald-700' : 'text-orange-700'}`}>
                    {resultSummary.aiResult.dressCodeMatches ? 'Código de vestimenta OK' : 'Discrepancia en vestimenta'}
                  </span>
                </div>
              </div>
              {resultSummary.aiResult.dressCodeMatches ? <CheckCircle size={18} className="text-emerald-600" /> : <AlertTriangle size={18} className="text-orange-600" />}
            </div>

            {resultSummary.diffMessage && (
               <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100">
                  <div className="flex items-center gap-3 text-blue-600 mb-1">
                    <Clock size={14} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Puntualidad</span>
                  </div>
                  <p className="text-xs font-bold text-blue-700">{resultSummary.diffMessage}</p>
               </div>
            )}

            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
              <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Comentarios IA</span>
              <p className="text-xs font-bold text-slate-600 italic leading-relaxed">"{resultSummary.aiResult.description}"</p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <button 
              onClick={onLogout}
              className={`w-full h-16 rounded-2xl font-black text-xs uppercase tracking-widest transition shadow-xl ${hasIssues ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
            >
              {hasIssues ? 'Confirmar con Incidencia y Salir' : 'Confirmar y Finalizar'}
            </button>
            <button 
              onClick={() => { setResultSummary(null); setPhoto(null); }}
              className="w-full h-16 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition border border-slate-100"
            >
              Volver a Fichar / Reintentar
            </button>
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

  // Branch for Admin View (Monitor)
  if (user.role === Role.ADMIN) {
    return (
      <div className="max-w-7xl mx-auto p-6 md:p-12 space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-white rounded-[48px] p-10 border border-slate-200 shadow-sm overflow-hidden">
           <div className="flex flex-col md:flex-row items-center justify-between mb-10 gap-6">
              <div>
                <h3 className="text-3xl font-black text-slate-900 tracking-tighter uppercase flex items-center gap-3">
                  <Monitor className="text-orange-600" size={32} /> Monitor de Fichadas
                </h3>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Sincronización en tiempo real del personal</p>
              </div>
              <div className="flex items-center gap-2 bg-emerald-50 px-6 py-3 rounded-full border border-emerald-100">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Estado: Online</span>
              </div>
           </div>

           <div className="overflow-x-auto rounded-[32px] border border-slate-100 bg-slate-50/50">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="p-6 text-[10px] font-black uppercase tracking-widest w-24 text-center">Evidencia</th>
                    <th className="p-6 text-[10px] font-black uppercase tracking-widest">Colaborador</th>
                    <th className="p-6 text-[10px] font-black uppercase tracking-widest text-center">Acción</th>
                    <th className="p-6 text-[10px] font-black uppercase tracking-widest text-center">Hora</th>
                    <th className="p-6 text-[10px] font-black uppercase tracking-widest">Ubicación</th>
                    <th className="p-6 text-[10px] font-black uppercase tracking-widest">Validación AI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {adminLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-20 text-center text-slate-400 font-bold italic">No hay registros recientes para mostrar.</td>
                    </tr>
                  ) : adminLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-white transition-colors group">
                      <td className="p-4">
                        <div 
                          onClick={() => log.photoEvidence && setZoomedImage(log.photoEvidence)}
                          className="relative w-16 h-16 mx-auto rounded-2xl overflow-hidden cursor-zoom-in border-2 border-white shadow-sm hover:scale-105 transition-transform"
                        >
                          {log.photoEvidence ? (
                            <>
                              <img src={log.photoEvidence} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <Maximize2 size={16} className="text-white" />
                              </div>
                            </>
                          ) : <UserIcon className="m-auto mt-4 text-slate-300" />}
                        </div>
                      </td>
                      <td className="p-6">
                        <div className="flex flex-col">
                          <span className="font-black text-slate-900 uppercase tracking-tight">{log.userName}</span>
                          <span className="text-[9px] font-black text-slate-400">Legajo: {log.legajo || 'N/A'}</span>
                        </div>
                      </td>
                      <td className="p-6 text-center">
                        <span className={`inline-block px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-tighter ${log.type === 'CHECK_IN' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-slate-200 text-slate-700 border border-slate-300'}`}>
                          {log.type === 'CHECK_IN' ? 'INGRESO' : 'EGRESO'}
                        </span>
                      </td>
                      <td className="p-6 text-center text-xs font-black text-slate-900 tabular-nums">
                        {new Date(log.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="p-6">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
                          <MapPin size={12} className="text-slate-400" />
                          {log.locationName}
                        </div>
                      </td>
                      <td className="p-6 max-w-xs">
                         <div className="flex flex-col gap-1.5">
                            <div className="flex gap-2">
                               <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${log.identityStatus === 'MATCH' ? 'bg-emerald-500' : 'bg-red-500'}`} title="Identidad"></span>
                               <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${log.dressCodeStatus === 'PASS' ? 'bg-emerald-500' : 'bg-orange-500'}`} title="Vestimenta"></span>
                               <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${log.locationStatus === 'VALID' ? 'bg-emerald-500' : 'bg-red-500'}`} title="Ubicación"></span>
                            </div>
                            <p className="text-[10px] italic text-slate-500 leading-tight line-clamp-2">"{log.aiFeedback}"</p>
                         </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
           </div>
        </div>

        {zoomedImage && (
          <div 
            className="fixed inset-0 z-[200] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-300"
            onClick={() => setZoomedImage(null)}
          >
             <button className="absolute top-8 right-8 text-white hover:scale-110 transition">
                <X size={48} />
             </button>
             <img src={zoomedImage} className="max-w-full max-h-full rounded-[40px] shadow-2xl border-4 border-white animate-in zoom-in-95 duration-300" />
          </div>
        )}
      </div>
    );
  }

  // Branch for regular user (Kiosk Mode)
  return (
    <div className="max-w-4xl mx-auto p-6 md:p-12 space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="max-w-xl mx-auto w-full">
        {!deviceLocation ? (
          <div className="bg-white rounded-[40px] p-12 border border-orange-200 shadow-xl text-center space-y-6">
            <div className="w-20 h-20 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto">
              <Laptop size={32} />
            </div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">TERMINAL NO CONFIGURADA</h3>
            <p className="text-slate-500 font-bold leading-relaxed">
              Este dispositivo aún no ha sido asignado a un Salón de UpFest.<br/>
              Un administrador debe configurar esta terminal desde el panel de Sedes.
            </p>
            <button onClick={onLogout} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl">Cerrar Sesión</button>
          </div>
        ) : (
          <div className="bg-white rounded-[40px] p-10 border border-slate-200 shadow-xl shadow-slate-200/50">
            <div className="flex items-center justify-between mb-8 pb-8 border-b border-slate-100">
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 rounded-3xl bg-slate-900 flex items-center justify-center text-white shadow-2xl shadow-slate-900/20 overflow-hidden border-4 border-white shrink-0">
                  {user.referenceImage ? <img src={user.referenceImage} className="w-full h-full object-cover" /> : <UserIcon size={32} />}
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">{user.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-black bg-orange-100 text-orange-700 px-3 py-1 rounded-full uppercase tracking-widest">DNI: {user.dni}</span>
                    <span className="text-[10px] font-black bg-slate-100 text-slate-400 px-3 py-1 rounded-full uppercase tracking-widest">{user.role}</span>
                  </div>
                </div>
              </div>
              <div className="text-right hidden sm:block">
                <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Ubicación Terminal</span>
                <div className="flex items-center gap-1.5 text-orange-600 font-black text-xs uppercase">
                  <MapPinned size={14} />
                  {deviceLocation.name}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                 <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-slate-900">
                    <span className="block text-[8px] font-black text-slate-600 uppercase tracking-widest">Inicio Hoy</span>
                    <span className="text-xs font-black">{todaySchedule?.start || '--:--'}</span>
                 </div>
                 <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-slate-900">
                    <span className="block text-[8px] font-black text-slate-600 uppercase tracking-widest">Fin Hoy</span>
                    <span className="text-xs font-black">{todaySchedule?.end || '--:--'}</span>
                 </div>
              </div>

              <div className="relative aspect-square rounded-[32px] overflow-hidden bg-slate-900 shadow-inner group">
                {!cameraActive && !photo && (
                  <button onClick={startCamera} className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3 hover:bg-slate-800 transition">
                    <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
                      <Camera size={28} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Activar Cámara</span>
                  </button>
                )}
                
                {cameraActive && (
                  <>
                    <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover scale-x-[-1]" />
                    <button onClick={capturePhoto} className="absolute bottom-8 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full bg-white border-8 border-white/30 shadow-2xl active:scale-95 transition" />
                  </>
                )}

                {photo && (
                  <>
                    <img src={photo} className="w-full h-full object-cover" />
                    <button onClick={() => setPhoto(null)} className="absolute top-4 right-4 p-3 bg-white/20 backdrop-blur-md text-white rounded-2xl hover:bg-white/40 transition">
                      <RotateCcw size={20} />
                    </button>
                  </>
                )}
                <canvas ref={canvasRef} className="hidden" />
              </div>

              <div className="space-y-4">
                 {turnCompletedToday && (
                    <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100 space-y-3">
                       <div className="flex items-center gap-3">
                          <CheckCircle className="text-emerald-500" size={24} />
                          <h4 className="font-black text-emerald-800 text-sm tracking-tight uppercase">TURNO DE HOY COMPLETADO</h4>
                       </div>
                       <p className="text-[10px] font-bold text-emerald-600 leading-relaxed uppercase tracking-widest">Ya has registrado tus fichadas de entrada y salida para esta jornada.</p>
                    </div>
                 )}
                 {!turnCompletedToday && lastLog?.type === 'CHECK_IN' && (
                    <div className="bg-orange-50 p-4 rounded-2xl border border-orange-100 flex items-center gap-3">
                       <AlertTriangle className="text-orange-500" size={16} />
                       <span className="text-[10px] font-bold text-orange-700">Tienes un ingreso activo en {lastLog.locationName}. Debes marcar salida antes de otro ingreso.</span>
                    </div>
                 )}
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => handleAction('CHECK_IN')}
                  disabled={isCheckInDisabled}
                  className="flex-1 bg-slate-900 text-white h-20 rounded-[28px] font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-slate-900/20 disabled:opacity-20 flex flex-col items-center justify-center transition-all hover:translate-y-[-2px]"
                >
                  {loading ? <RefreshCw className="animate-spin" size={20}/> : <><Clock size={20} className="mb-1"/> Ingreso</>}
                  {lastLog?.type === 'CHECK_IN' && <span className="text-[8px] opacity-60">Activo</span>}
                </button>
                <button 
                  onClick={() => handleAction('CHECK_OUT')}
                  disabled={isCheckOutDisabled}
                  className="flex-1 bg-white border-2 border-slate-100 text-slate-900 h-20 rounded-[28px] font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-slate-200/50 disabled:opacity-20 flex flex-col items-center justify-center transition-all hover:translate-y-[-2px]"
                >
                  {loading ? <RefreshCw className="animate-spin" size={20}/> : <><LogOut size={20} className="mb-1"/> Egreso</>}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <p className="text-center text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">UpFest Control Biométrico v4.5 - Kiosk Mode</p>
    </div>
  );
};

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
  const [editingDay, setEditingDay] = useState('Lunes');
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

  const inputClass = "w-full border border-slate-200 rounded-xl p-3 text-sm text-slate-900 bg-white placeholder:text-slate-400 focus:ring-4 focus:ring-slate-100 outline-none transition-all";

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[80vh] overflow-y-auto pr-2 custom-scrollbar">
      <div className="grid grid-cols-2 gap-4">
        <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">DNI (Identificador)</label><input type="text" value={formData.dni} onChange={e => setFormData({...formData, dni: e.target.value})} className={inputClass} required /></div>
        <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Legajo</label><input type="text" value={formData.legajo} onChange={e => setFormData({...formData, legajo: e.target.value})} className={inputClass} /></div>
      </div>
      <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Nombre Completo</label><input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className={inputClass} required /></div>
      
      <div className="grid grid-cols-2 gap-4">
          <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Rol</label>
              <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as Role})} className={inputClass}>
                  {Object.values(Role).map(r => <option key={r} value={r}>{r}</option>)}
              </select>
          </div>
          <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Valor Hora ($)</label><input type="number" value={formData.hourlyRate} onChange={e => setFormData({...formData, hourlyRate: parseFloat(e.target.value)})} className={inputClass} /></div>
      </div>

      <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Indicaciones de Vestimenta</label><textarea value={formData.dressCode} onChange={e => setFormData({...formData, dressCode: e.target.value})} className={inputClass} placeholder="Ej: Camisa blanca, pantalón negro..." rows={2} /></div>

      <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest mb-4 block">Gestión de Horarios</label>
          <div className="flex flex-wrap items-center gap-2 mb-4 bg-white p-3 rounded-xl border border-slate-200">
              <select 
                value={editingDay} 
                onChange={e => setEditingDay(e.target.value)} 
                className="flex-1 min-w-[90px] text-xs border border-slate-100 bg-slate-50 rounded p-2 text-slate-900 outline-none"
              >
                {days.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <div className="flex-[2] flex items-center gap-1 min-w-[140px]">
                <input 
                  type="time" 
                  value={startTime} 
                  onChange={e => setStartTime(e.target.value)} 
                  className="w-full text-xs border border-slate-100 rounded bg-slate-50 text-slate-900 outline-none p-2" 
                />
                <span className="text-slate-300">-</span>
                <input 
                  type="time" 
                  value={endTime} 
                  onChange={e => setEndTime(e.target.value)} 
                  className="w-full text-xs border border-slate-100 rounded bg-slate-50 text-slate-900 outline-none p-2" 
                />
              </div>
              <button 
                type="button" 
                onClick={addSchedule} 
                className="p-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition shadow-sm shrink-0"
              >
                <Plus size={18}/>
              </button>
          </div>
          <div className="space-y-2">
              {formData.schedule.map(s => (
                  <div key={s.day} className="flex justify-between items-center text-xs bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                      <span className="font-black text-slate-900 w-20">{s.day}:</span> 
                      <span className="text-slate-600 font-bold">{s.start} a {s.end}</span>
                      <button type="button" onClick={() => removeSchedule(s.day)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14}/></button>
                  </div>
              ))}
              {formData.schedule.length === 0 && <p className="text-[10px] text-slate-400 italic text-center py-2">No hay horarios definidos</p>}
          </div>
      </div>

      <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Contraseña</label><input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className={inputClass} required /></div>
      
      <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
         <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest mb-3 block">Biometría de Referencia</label>
         <div className="flex items-center gap-4">
            <label className="cursor-pointer bg-white border border-slate-200 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition shadow-sm">
                Seleccionar Foto
                <input type="file" onChange={handleImageUpload} className="hidden" />
            </label>
            {imagePreview && (
                <div className="relative w-16 h-16 rounded-xl overflow-hidden border-2 border-white shadow-md">
                    <img src={imagePreview} className="w-full h-full object-cover" alt="Preview" />
                    <button type="button" onClick={() => {setImagePreview(null); setFormData({...formData, referenceImage: null});}} className="absolute top-0 right-0 bg-red-500 text-white p-0.5"><X size={10}/></button>
                </div>
            )}
         </div>
      </div>

      <div>
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Sedes Autorizadas</label>
        <div className="flex flex-wrap gap-2">
            {locations.map(loc => (
                <button key={loc.id} type="button" onClick={() => toggleLocation(loc.id)} className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition ${formData.assignedLocations?.includes(loc.id) ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}>
                    {loc.name}
                </button>
            ))}
        </div>
      </div>

      <div className="flex gap-4 pt-6 border-t sticky bottom-0 bg-white z-10">
          <button type="button" onClick={onCancel} disabled={isSubmitting} className="flex-1 px-6 py-4 border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition">Cancelar</button>
          <button type="submit" disabled={isSubmitting} className="flex-1 bg-slate-900 text-white px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition shadow-xl shadow-slate-200 disabled:opacity-50">
            {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
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

    const inputClass = "w-full border border-slate-200 rounded-xl p-3 text-sm text-slate-900 bg-white placeholder:text-slate-400 focus:ring-4 focus:ring-slate-100 outline-none transition-all";

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Nombre de la Sede</label><input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className={inputClass} required /></div>
            <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Dirección</label><input type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className={inputClass} /></div>
            <div className="grid grid-cols-2 gap-4">
                <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Latitud</label><input type="number" step="any" value={formData.lat} onChange={e => setFormData({...formData, lat: parseFloat(e.target.value)})} className={inputClass} required /></div>
                <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Longitud</label><input type="number" step="any" value={formData.lng} onChange={e => setFormData({...formData, lng: parseFloat(e.target.value)})} className={inputClass} required /></div>
            </div>
            <button type="button" onClick={handleGetLocation} className="text-[10px] font-black text-orange-600 flex items-center gap-2 hover:bg-orange-50 px-3 py-2 rounded-xl transition w-fit border border-transparent hover:border-orange-100 uppercase tracking-widest"><MapPin size={14} /> Obtener Mi ubicación actual</button>
            <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Radio de Tolerancia (Metros)</label><input type="number" value={formData.radiusMeters} onChange={e => setFormData({...formData, radiusMeters: parseInt(e.target.value)})} className={inputClass} /></div>
            
            <div className="flex gap-4 pt-6 border-t">
                <button type="button" onClick={onCancel} disabled={isSubmitting} className="flex-1 px-6 py-4 border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition">Cancelar</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-slate-900 text-white px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition shadow-xl shadow-slate-200 disabled:opacity-50">
                  {isSubmitting ? 'Guardando...' : 'Guardar Sede'}
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
                    <th className="p-6 text-[10px] font-black text-slate-900 uppercase tracking-widest">Personal</th>
                    <th className="p-6 text-[10px] font-black text-slate-900 uppercase tracking-widest">DNI</th>
                    <th className="p-6 text-[10px] font-black text-slate-900 uppercase tracking-widest text-center">Rol</th>
                    <th className="p-6 text-[10px] font-black text-slate-900 uppercase tracking-widest text-right">Acciones</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {loading ? (
                    <tr><td colSpan={4} className="p-16 text-center text-slate-400 font-bold italic text-slate-900">Sincronizando con la nube...</td></tr>
                ) : users.length === 0 ? (
                    <tr><td colSpan={4} className="p-16 text-center text-slate-400 font-bold italic text-slate-900">No hay usuarios registrados.</td></tr>
                ) : users.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-6">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-slate-100 overflow-hidden border border-slate-200 shrink-0 shadow-sm">
                                    {u.referenceImage ? <img src={u.referenceImage} className="w-full h-full object-cover" /> : <UserIcon size={20} className="m-auto mt-3 text-slate-300"/>}
                                </div>
                                <div>
                                    <span className="font-black text-slate-800 block tracking-tight">{u.name}</span>
                                    <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider">{u.role}</span>
                                </div>
                            </div>
                        </td>
                        <td className="p-6 text-sm font-mono font-bold text-slate-900 tracking-tighter">{u.dni}</td>
                        <td className="p-6 text-center text-[10px] font-black text-slate-900 uppercase tracking-tighter">{u.role}</td>
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
    const [currentDeviceLocId, setCurrentDeviceLocId] = useState<string | null>(null);

    useEffect(() => {
      setCurrentDeviceLocId(localStorage.getItem('upfest_terminal_location_id'));
    }, []);

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

    const handleSetTerminalLocation = (locId: string) => {
      localStorage.setItem('upfest_terminal_location_id', locId);
      setCurrentDeviceLocId(locId);
      alert("Terminal vinculada correctamente a esta sede.");
    };

    return (
        <div className="max-w-7xl mx-auto p-6">
            <div className="flex justify-between items-center mb-8">
                <div>
                  <h1 className="text-3xl font-black text-slate-900 tracking-tighter">SALONES</h1>
                  <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1 text-slate-900">Sedes UpFest & Geocercas</p>
                </div>
                <button onClick={() => setIsCreating(true)} className="bg-slate-900 text-white px-6 py-3 rounded-2xl flex items-center gap-2 hover:bg-slate-800 transition shadow-xl shadow-slate-200 font-black text-xs uppercase tracking-widest"><Plus size={18} /> Nuevo Salón</button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {loading ? (
                    <div className="col-span-full py-20 text-center text-slate-400 font-bold italic tracking-widest uppercase text-xs text-slate-900">Sincronizando Sedes...</div>
                ) : locations.length === 0 ? (
                    <div className="col-span-full py-20 text-center text-slate-400 font-bold italic text-slate-900">No hay salones registrados.</div>
                ) : locations.map(loc => (
                    <div key={loc.id} className={`bg-white rounded-[32px] p-8 border ${currentDeviceLocId === loc.id ? 'border-orange-500 ring-4 ring-orange-500/10' : 'border-slate-200'} shadow-sm hover:shadow-xl transition-all group relative overflow-hidden flex flex-col`}>
                        {currentDeviceLocId === loc.id && (
                          <div className="absolute top-4 right-4 bg-orange-500 text-white px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-lg">
                            <Laptop size={10}/> Terminal Activa
                          </div>
                        )}
                        <div className="p-5 bg-orange-50 text-orange-600 rounded-[24px] w-fit mb-6 shadow-inner"><MapPinned size={32} /></div>
                        <h3 className="font-black text-slate-900 text-2xl mb-2 tracking-tighter">{loc.name}</h3>
                        <p className="text-sm text-slate-900 mb-6 font-bold leading-relaxed">{loc.address}, {loc.city}</p>
                        
                        <div className="flex flex-wrap items-center gap-2 text-[10px] font-black text-slate-300 mb-8">
                            <span className="bg-slate-50 px-3 py-1.5 rounded-full tracking-tighter border border-slate-100 text-slate-900">LAT: {loc.lat.toFixed(4)}</span>
                            <span className="bg-slate-50 px-3 py-1.5 rounded-full tracking-tighter border border-slate-100 text-slate-900">LNG: {loc.lng.toFixed(4)}</span>
                            <span className="bg-orange-600 text-white px-3 py-1.5 rounded-full tracking-tighter border border-orange-700">R: {loc.radiusMeters}M</span>
                        </div>

                        <div className="mt-auto pt-6 border-t border-slate-50 flex gap-3">
                           {currentDeviceLocId !== loc.id && (
                              <button 
                                onClick={() => handleSetTerminalLocation(loc.id)}
                                className="flex-1 bg-slate-900 text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition shadow-lg"
                              >
                                Vincular Dispositivo
                              </button>
                           )}
                           <button onClick={() => setEditingLoc(loc)} className="p-3 bg-slate-100 text-slate-500 hover:text-orange-600 rounded-xl transition-transform hover:scale-105" title="Editar"><Pencil size={16}/></button>
                           <button onClick={() => handleDelete(loc.id)} className="p-3 bg-slate-100 text-slate-500 hover:text-red-600 rounded-xl transition-transform hover:scale-105" title="Eliminar"><Trash2 size={16}/></button>
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
    dateDisplay: string;
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
                    const dateObj = new Date(date + 'T12:00:00');
                    const dayOfWeekRaw = dateObj.toLocaleDateString('es-ES', { weekday: 'long' });
                    const capitalizedDay = dayOfWeekRaw.charAt(0).toUpperCase() + dayOfWeekRaw.slice(1);
                    
                    const formattedDate = dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
                    const dateDisplay = `${capitalizedDay} ${formattedDate}`;

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
                        dateDisplay,
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
            head: [['#', 'Día y Fecha', 'Persona', 'Rol', 'H. Ingreso (P)', 'H. Ingreso (R)', 'H. Egreso (P)', 'H. Egreso (R)', 'Hs', 'Detalle IA']],
            body: payrollItems.map((item, i) => [
                i + 1, item.dateDisplay, item.userName, item.role, item.scheduledIn, item.realIn, item.scheduledOut, item.realOut, item.diffHours, item.aiDetail
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
                    <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1 text-slate-900">Auditoría horaria asistida por IA</p>
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
                        <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Fecha Inicio</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-6 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-8 focus:ring-orange-500/5 outline-none transition font-extrabold text-slate-900" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Fecha Fin</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-6 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-8 focus:ring-orange-500/5 outline-none transition font-extrabold text-slate-900" />
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
                                <th className="p-6 text-[10px] font-black text-slate-900 uppercase tracking-widest text-center w-12">#</th>
                                <th className="p-6 text-[10px] font-black text-slate-900 uppercase tracking-widest">Día y Fecha</th>
                                <th className="p-6 text-[10px] font-black text-slate-900 uppercase tracking-widest">Persona</th>
                                <th className="p-6 text-[10px] font-black text-slate-900 uppercase tracking-widest">Rol</th>
                                <th className="p-6 text-[10px] font-black text-slate-900 uppercase tracking-widest text-center">H. Ingreso (P)</th>
                                <th className="p-6 text-[10px] font-black text-slate-900 uppercase tracking-widest text-center">H. Ingreso (R)</th>
                                <th className="p-6 text-[10px] font-black text-slate-900 uppercase tracking-widest text-center">H. Egreso (P)</th>
                                <th className="p-6 text-[10px] font-black text-slate-900 uppercase tracking-widest text-center">H. Egreso (R)</th>
                                <th className="p-6 text-[10px] font-black text-slate-900 uppercase tracking-widest text-center">Total Hs</th>
                                <th className="p-6 text-[10px] font-black text-slate-900 uppercase tracking-widest">Observación IA</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr><td colSpan={10} className="p-24 text-center text-slate-400 italic font-black uppercase tracking-[0.2em] text-[10px] text-slate-900">Analizando incidencias con UpFest AI...</td></tr>
                            ) : payrollItems.length === 0 ? (
                                <tr><td colSpan={10} className="p-24 text-center text-slate-400 italic font-bold text-slate-900">No hay registros para este período.</td></tr>
                            ) : payrollItems.map((item, idx) => (
                                <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${item.isIncident ? 'bg-orange-50/20' : ''}`}>
                                    <td className="p-6 text-center font-mono text-xs text-slate-900">{idx + 1}</td>
                                    <td className="p-6"><span className="text-[10px] font-black text-slate-900 uppercase">{item.dateDisplay}</span></td>
                                    <td className="p-6 font-black text-slate-900 tracking-tight">{item.userName}</td>
                                    <td className="p-6"><span className="text-[10px] font-black bg-slate-100 text-slate-400 px-3 py-1.5 rounded-full border border-slate-200 uppercase tracking-tighter text-slate-900">{item.role}</span></td>
                                    <td className="p-6 text-center text-xs font-bold text-slate-500">{item.scheduledIn}</td>
                                    <td className={`p-6 text-center text-sm font-black ${item.realIn > item.scheduledIn && item.scheduledIn !== '--:--' ? 'text-red-500' : 'text-slate-900'}`}>{item.realIn}</td>
                                    <td className="p-6 text-center text-xs font-bold text-slate-500">{item.scheduledOut}</td>
                                    <td className={`p-6 text-center text-sm font-black ${item.realOut < item.scheduledOut && item.scheduledOut !== '--:--' ? 'text-red-500' : 'text-slate-900'}`}>{item.realOut}</td>
                                    <td className="p-6 text-center font-mono font-black text-slate-900 bg-slate-50/50">{item.diffHours}H</td>
                                    <td className="p-6 max-w-xs text-slate-900">
                                        <div className="flex items-start gap-2 italic text-xs font-bold leading-relaxed">
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
            <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Asistencia</span>
        </div>
        <nav className="flex-1 p-8 space-y-2">
            <button onClick={() => setActiveTab('clock')} className={`w-full flex items-center gap-4 px-6 py-4 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition ${activeTab === 'clock' ? 'bg-orange-50 text-orange-700 shadow-sm' : 'text-slate-400 hover:bg-slate-50'}`}><Clock size={20}/> {currentUser.role === Role.ADMIN ? 'Monitor' : 'Fichadas'}</button>
            {currentUser.role === Role.ADMIN && (
                <>
                    <button onClick={() => setActiveTab('payroll')} className={`w-full flex items-center gap-4 px-6 py-4 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition ${activeTab === 'payroll' ? 'bg-orange-50 text-orange-700 shadow-sm' : 'text-slate-400 hover:bg-slate-50'}`}><Wallet size={20}/> Liquidaciones</button>
                    <button onClick={() => setActiveTab('admin')} className={`w-full flex items-center gap-4 px-6 py-4 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition ${activeTab === 'admin' ? 'bg-orange-50 text-orange-700 shadow-sm' : 'text-slate-400 hover:bg-slate-50'}`}><Users size={20}/> Personal</button>
                    <button onClick={() => setActiveTab('locations')} className={`w-full flex items-center gap-4 px-6 py-4 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition ${activeTab === 'locations' ? 'bg-orange-50 text-orange-700 shadow-sm' : 'text-slate-400 hover:bg-slate-50'}`}><Building size={20}/> Salones</button>
                </>
            )}
        </nav>
        <div className="p-8 border-t border-slate-50">
            <div className="mb-4 px-6 py-2 bg-slate-50 rounded-2xl">
              <span className="block text-[8px] font-black text-slate-300 uppercase tracking-widest">DNI Sesión</span>
              <span className="text-[10px] font-black text-slate-600">{currentUser.dni}</span>
            </div>
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

  const handleLogout = () => {
    setCurrentUser(null);
    setActiveTab('clock');
  };

  if (!currentUser) return <LoginView onLogin={u => { setCurrentUser(u); setActiveTab(u.role === Role.ADMIN ? 'payroll' : 'clock'); }} logoUrl={logoUrl} />;

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} currentUser={currentUser} onLogout={handleLogout} logoUrl={logoUrl} />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
          <main className="flex-1 overflow-y-auto custom-scrollbar">
            {activeTab === 'clock' && <ClockView user={currentUser} onLogout={handleLogout} />}
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
        else setError('DNI O CONTRASEÑA INCORRECTOS');
    } catch (e) { setError('ERROR DE CONEXIÓN AL SERVIDOR'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 font-sans">
      <div className="w-full max-sm:px-4 max-w-sm bg-white rounded-[48px] shadow-2xl p-14 max-sm:p-8 space-y-12 border border-slate-100 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-orange-600"></div>
        <div className="text-center">
          {logoUrl ? <img src={logoUrl} alt="Logo" className="h-20 w-auto mx-auto mb-8" /> : <div className="w-24 h-24 bg-slate-900 rounded-[32px] flex items-center justify-center mx-auto mb-8 text-white font-black text-4xl shadow-2xl">UP</div>}
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter mb-2 uppercase tracking-tighter">ENTRAR</h2>
          <p className="text-slate-900 font-black text-[10px] uppercase tracking-[0.3em]">Acceso con DNI</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest ml-4">Tu DNI</label>
            <input type="text" value={dni} onChange={e => setDni(e.target.value)} className="w-full px-8 py-6 bg-white border border-slate-200 rounded-[24px] focus:ring-8 focus:ring-orange-500/5 outline-none font-extrabold placeholder:text-slate-400 text-lg shadow-inner text-slate-900" placeholder="00.000.000" required />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest ml-4">Contraseña</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-8 py-6 bg-white border border-slate-200 rounded-[24px] focus:ring-8 focus:ring-orange-500/5 outline-none font-extrabold placeholder:text-slate-400 text-lg shadow-inner text-slate-900" placeholder="••••••••" required />
          </div>
          {error && <div className="text-red-500 text-[10px] text-center font-black bg-red-50 p-5 rounded-[20px] border border-red-100 tracking-[0.2em] uppercase">{error}</div>}
          <button type="submit" disabled={loading} className={`w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-6 rounded-[24px] transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-2xl shadow-slate-200 uppercase tracking-widest text-xs ${loading ? 'opacity-50' : ''}`}>
            {loading ? 'Sincronizando...' : 'ACCEDER'}
          </button>
        </form>
      </div>
    </div>
  );
};
