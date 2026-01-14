
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
  LogOut, CheckCircle, XCircle, AlertTriangle, Plus, Save, Lock, Hash, Upload, Trash2, ImageIcon, Pencil, X, RotateCcw, FileText, Users, Building, MapPin, Monitor, Maximize2, Laptop, FileUp, Key, Bell, BellRing, Wallet, MapPinned, RefreshCw, UserCheck, Shirt, Download, FileSpreadsheet, Menu, ArrowRight, Calendar, Briefcase
} from 'lucide-react';

// --- Helpers ---
const handleOpenApiKeyDialog = async () => {
  if (window.aistudio && window.aistudio.openSelectKey) await window.aistudio.openSelectKey();
  else alert("Configuración solo disponible en AI Studio.");
};

const getDayName = (dateStr: string) => {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('es-AR', { weekday: 'long' }).format(date);
};

const getFormattedDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
};

// --- Clock View (User & Monitor) ---
const ClockView = ({ user, onLogout }: { user: User, onLogout: () => void }) => {
  const [locations, setLocations] = useState<Location[]>([]);
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
  
  const defaultWebhook = 'https://script.google.com/macros/s/AKfycbxFfuiW2oOkPpao2bL0G45mxZR5hZ5-4T2Ko-f04oFPSwEaLaREHyAg7iiEXdCBl8dY/exec';
  const [gsheetUrl, setGsheetUrl] = useState(localStorage.getItem('upfest_gsheet_webhook') || defaultWebhook);
  const [gsheetName, setGsheetName] = useState(localStorage.getItem('upfest_gsheet_name') || 'Fichadas');
  const [successAction, setSuccessAction] = useState<{ type: string, countdown: number } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const loadData = () => {
    const deviceLocId = localStorage.getItem('upfest_terminal_location_id');

    Promise.all([
      fetchLocations(),
      fetchLogs()
    ]).then(([allLocs, logs]) => {
      setLocations(allLocs);
      if (user.role === 'Admin') setAdminLogs(logs);
      setUserTodayLogs(logs.filter(l => l.userId === user.id && new Date(l.timestamp).toDateString() === new Date().toDateString()));
      if (deviceLocId) setDeviceLocation(allLocs.find(l => l.id === deviceLocId) || null);
    });
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [user.id]);

  useEffect(() => {
    async function startCamera() {
      if (cameraActive) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1080 } } 
          });
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch (err) {
          console.error("Error accessing camera:", err);
          alert("No se pudo acceder a la cámara.");
          setCameraActive(false);
        }
      } else {
        stopCamera();
      }
    }
    startCamera();
    return () => stopCamera();
  }, [cameraActive]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
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
      let targetLoc = deviceLocation;

      try {
        const pos = await getCurrentPosition();
        if (targetLoc) {
          const dist = calculateDistance(pos.coords.latitude, pos.coords.longitude, targetLoc.lat, targetLoc.lng);
          locStatus = dist <= targetLoc.radiusMeters ? 'VALID' : 'INVALID';
        }
      } catch (e) { console.warn("Geo error", e); }

      setLoadingMsg('IA: Analizando Identidad y Vestimenta...');
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
        locationId: targetLoc?.id || 'manual',
        locationName: targetLoc?.name || 'Ubicación Desconocida',
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
    } catch (error: any) {
      alert("Error al registrar: " + error.message);
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context?.drawImage(videoRef.current, 0, 0);
      const data = canvasRef.current.toDataURL('image/jpeg');
      setPhoto(data);
      setCameraActive(false);
    }
  };

  const handleDeleteLog = async (logId: string) => {
    if (!confirm('¿CONFIRMAS ELIMINAR ESTA FICHADA?')) return;
    setIsDeleting(logId);
    try {
      await deleteLog(logId);
      setAdminLogs(prev => prev.filter(l => l.id !== logId));
      loadData();
    } catch (e: any) { alert(e.message); } finally { setIsDeleting(null); }
  };

  const saveGSheetSettings = () => {
    localStorage.setItem('upfest_gsheet_webhook', gsheetUrl);
    localStorage.setItem('upfest_gsheet_name', gsheetName);
    alert("Configuración de Google Sheets guardada.");
  };

  if (user.role === 'Admin') {
    const incidentLogs = adminLogs.filter(l => l.dressCodeStatus === 'FAIL' || l.identityStatus === 'NO_MATCH');
    return (
      <div className="max-w-full mx-auto p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
        <div className="bg-[#0f172a] text-white p-6 rounded-[32px] flex flex-col xl:flex-row items-center justify-between gap-4 border-2 border-emerald-500/30">
            <div className="flex items-center gap-4 w-full xl:w-auto">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center">
                  <FileSpreadsheet className="text-emerald-400" size={24} />
                </div>
                <div>
                    <h4 className="font-black text-xs uppercase tracking-widest">Google Sheets Webhook Activo</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase italic">Sincronizando todas las fichadas en vivo</p>
                </div>
            </div>
            <div className="flex flex-col md:flex-row gap-2 w-full xl:max-w-2xl">
                <input type="text" placeholder="URL del Webhook..." className="flex-[2] bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-[10px] outline-none focus:border-emerald-500 transition-colors" value={gsheetUrl} onChange={e => setGsheetUrl(e.target.value)} />
                <input type="text" placeholder="Pestaña (Ej: Fichadas)" className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-[10px] outline-none focus:border-emerald-500 transition-colors" value={gsheetName} onChange={e => setGsheetName(e.target.value)} />
                <button onClick={saveGSheetSettings} className="bg-emerald-600 hover:bg-emerald-500 px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-colors shadow-lg shadow-emerald-900/20">Actualizar</button>
            </div>
        </div>

        <div className="bg-white rounded-[32px] p-6 md:p-10 border border-slate-200 shadow-sm overflow-hidden">
           <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-6">
              <div><h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase flex items-center gap-3"><Monitor className="text-orange-600" /> MONITOR DE PERSONAL</h3><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">En vivo - UpFest Control</p></div>
              <div className="flex items-center gap-3">
                <button onClick={() => setShowAlerts(!showAlerts)} className={`px-6 py-4 rounded-full border flex items-center gap-3 transition-all ${incidentLogs.length > 0 ? 'bg-red-50 border-red-200 text-red-600 shadow-lg shadow-red-100' : 'bg-slate-50 text-slate-400'}`}>
                    <Bell size={20} className={incidentLogs.length > 0 ? 'animate-bounce' : ''}/>
                    <span className="text-xs font-black uppercase">Alertas ({incidentLogs.length})</span>
                </button>
                <button onClick={handleOpenApiKeyDialog} className="bg-slate-900 text-white px-6 py-4 rounded-full flex items-center gap-3 shadow-xl hover:bg-slate-800 transition-colors"><Key size={18}/><span className="text-xs font-black uppercase">Configurar IA</span></button>
              </div>
           </div>

           {showAlerts && (
               <div className="mb-10 p-6 bg-red-50 rounded-[32px] border border-red-100 animate-in slide-in-from-top-4">
                  <h4 className="font-black text-red-800 text-sm uppercase mb-4 flex items-center gap-2"><BellRing size={18}/> Incidencias Recientes</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {incidentLogs.length === 0 ? <p className="text-[10px] font-bold text-red-300 py-4 uppercase">Sin novedades críticas.</p> : incidentLogs.slice(0, 10).map(l => (
                      <div key={l.id} className="bg-white p-4 rounded-2xl border border-red-100 flex items-center justify-between group">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-black text-xs uppercase">{l.userName[0]}</div>
                          <div><span className="block font-black text-slate-900 text-xs uppercase">{l.userName}</span><span className="text-[9px] font-bold text-red-500 uppercase italic">Motivo: {l.aiFeedback}</span></div>
                        </div>
                        <button onClick={() => handleDeleteLog(l.id)} className="p-2 text-slate-300 hover:text-red-500"><Trash2 size={16}/></button>
                      </div>
                    ))}
                  </div>
               </div>
           )}

           <div className="overflow-x-auto bg-slate-50/50 rounded-[24px] border border-slate-100">
              <table className="w-full text-left min-w-[1200px] border-collapse">
                <thead>
                  <tr className="bg-[#0f172a] text-white">
                    <th className="p-6 text-[10px] font-black uppercase text-center">Foto</th>
                    <th className="p-6 text-[10px] font-black uppercase">Colaborador</th>
                    <th className="p-6 text-[10px] font-black uppercase text-center">Fecha</th>
                    <th className="p-6 text-[10px] font-black uppercase text-center">Día</th>
                    <th className="p-6 text-[10px] font-black uppercase text-center">Hora</th>
                    <th className="p-6 text-[10px] font-black uppercase text-center">Tipo</th>
                    <th className="p-6 text-[10px] font-black uppercase text-center">Rostro</th>
                    <th className="p-6 text-[10px] font-black uppercase text-center">Vestimenta</th>
                    <th className="p-6 text-[10px] font-black uppercase">Descripción</th>
                    <th className="p-6 text-[10px] font-black uppercase text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {adminLogs.map(log => (
                    <tr key={log.id} className="hover:bg-white transition-colors group">
                      <td className="p-6 text-center">
                        <div onClick={() => log.photoEvidence && setZoomedImage(log.photoEvidence)} className="w-14 h-14 mx-auto rounded-xl overflow-hidden border cursor-zoom-in shadow-sm hover:ring-4 hover:ring-orange-100 transition-all">
                          {log.photoEvidence ? <img src={log.photoEvidence} className="w-full h-full object-cover" /> : <UserIcon className="m-auto mt-4 text-slate-300" />}
                        </div>
                      </td>
                      <td className="p-6">
                        <span className="block font-black text-slate-900 text-sm uppercase leading-tight">{log.userName}</span>
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Legajo: {log.legajo}</span>
                      </td>
                      <td className="p-6 text-center text-xs font-bold text-slate-600 font-mono">
                        {getFormattedDate(log.timestamp)}
                      </td>
                      <td className="p-6 text-center text-[10px] font-black uppercase text-slate-400">
                        {getDayName(log.timestamp)}
                      </td>
                      <td className="p-6 text-center text-xs font-black text-slate-900 font-mono">
                        {new Date(log.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase()}
                      </td>
                      <td className="p-6 text-center">
                        <span className={`px-4 py-2 rounded-full text-[9px] font-black uppercase border ${log.type === 'CHECK_IN' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                          {log.type === 'CHECK_IN' ? 'INGRESO' : 'EGRESO'}
                        </span>
                      </td>
                      <td className="p-6 text-center">
                        {log.identityStatus === 'MATCH' ? (
                          <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">COINCIDE</span>
                        ) : (
                          <span className="text-[9px] font-black text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-100">NO COINCIDE</span>
                        )}
                      </td>
                      <td className="p-6 text-center">
                        {log.dressCodeStatus === 'PASS' ? (
                          <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 uppercase">Cumple</span>
                        ) : (
                          <span className="text-[9px] font-black text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-100 uppercase">No cumple</span>
                        )}
                      </td>
                      <td className="p-6 max-w-xs">
                        <p className="text-[10px] italic text-slate-500 leading-relaxed font-medium">
                          "{log.aiFeedback}"
                        </p>
                      </td>
                      <td className="p-6 text-center">
                        <button disabled={isDeleting === log.id} onClick={() => handleDeleteLog(log.id)} className="p-3 text-slate-200 hover:text-red-500 transition-all">
                          {isDeleting === log.id ? <RefreshCw className="animate-spin" size={18}/> : <Trash2 size={20}/>}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
           </div>
        </div>
        {zoomedImage && (<div className="fixed inset-0 z-[200] bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-8" onClick={() => setZoomedImage(null)}><img src={zoomedImage} className="max-w-full max-h-full rounded-[40px] shadow-2xl border-4 border-white animate-in zoom-in-95" /></div>)}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 relative">
      {successAction && (
        <div className="fixed inset-0 z-[150] bg-orange-600 flex flex-col items-center justify-center text-white p-10 animate-in fade-in duration-300">
           <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mb-8 animate-bounce"><CheckCircle size={48} className="text-white" /></div>
           <h2 className="text-5xl font-black uppercase tracking-tighter mb-4 text-center">¡{successAction.type} REGISTRADO!</h2>
           <p className="text-lg font-bold opacity-80 uppercase tracking-widest mb-12 text-center">Buen trabajo, {user.name.split(' ')[0]}</p>
           <div className="bg-white/10 backdrop-blur-md px-10 py-6 rounded-[32px] border border-white/20 flex flex-col items-center">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2">Cerrando sesión en</span>
              <span className="text-6xl font-black">{successAction.countdown}</span>
              <button onClick={onLogout} className="mt-8 bg-white text-orange-600 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl">Cerrar ahora</button>
           </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-[40px] p-8 border shadow-xl flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-black uppercase tracking-tighter">Terminal de Fichaje</h2>
            {deviceLocation && <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1"><MapPinned size={10}/> {deviceLocation.name}</span>}
          </div>
          <div className="aspect-square rounded-[32px] overflow-hidden bg-slate-900 mb-6 relative border-4 border-slate-100">
             {!cameraActive && !photo && (
               <button onClick={() => setCameraActive(true)} className="absolute inset-0 text-white font-black uppercase text-xs flex flex-col items-center justify-center gap-4 hover:bg-slate-800 transition-colors">
                 <div className="w-16 h-16 rounded-full bg-orange-600 flex items-center justify-center shadow-xl"><Camera size={32}/></div>
                 Activar Cámara
               </button>
             )}
             {cameraActive && <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover scale-x-[-1]" />}
             {photo && <img src={photo} className="w-full h-full object-cover" />}
             {loading && (
               <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center text-white p-6 text-center z-10">
                 <RefreshCw className="animate-spin mb-4" size={40} />
                 <p className="font-black text-xs uppercase tracking-widest">{loadingMsg || 'Procesando...'}</p>
               </div>
             )}
          </div>
          <div className="space-y-3">
            {cameraActive && <button onClick={capturePhoto} className="w-full py-5 bg-orange-600 text-white rounded-[24px] font-black uppercase tracking-widest shadow-xl shadow-orange-100 transition-transform active:scale-95">Capturar Foto</button>}
            {photo && !loading && <button onClick={handleClockAction} className="w-full py-5 bg-slate-900 text-white rounded-[24px] font-black uppercase tracking-widest shadow-xl flex items-center justify-center gap-2">Confirmar Fichada <ArrowRight size={18}/></button>}
            {photo && !loading && <button onClick={() => { setPhoto(null); setCameraActive(true); }} className="w-full py-4 bg-slate-100 text-slate-500 rounded-[20px] font-black uppercase text-[10px] tracking-widest">Tomar otra foto</button>}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-[32px] p-8 border shadow-sm">
            <h3 className="font-black text-xs uppercase text-slate-400 tracking-widest mb-4">Colaborador</h3>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 overflow-hidden border">
                {user.referenceImage ? <img src={user.referenceImage} className="w-full h-full object-cover" /> : <UserIcon className="m-auto mt-4 text-slate-300" />}
              </div>
              <div>
                <h4 className="font-black text-lg text-slate-900 uppercase leading-none">{user.name}</h4>
                <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase">Puesto: {user.role}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-[32px] p-8 border shadow-sm flex-1 overflow-hidden">
             <h3 className="font-black text-xs uppercase text-slate-400 tracking-widest mb-6 flex justify-between">
                <span>Actividad de Hoy</span>
                <span className="text-slate-900">{new Date().toLocaleDateString('es-AR')}</span>
             </h3>
             <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                {userTodayLogs.length === 0 ? (
                  <div className="py-10 text-center border-2 border-dashed rounded-3xl border-slate-100">
                    <Clock size={32} className="mx-auto text-slate-200 mb-2"/>
                    <p className="text-[10px] font-black text-slate-300 uppercase">Sin movimientos hoy</p>
                  </div>
                ) : userTodayLogs.map(l => (
                  <div key={l.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${l.type === 'CHECK_IN' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-600'}`}>
                        {l.type === 'CHECK_IN' ? <UserCheck size={18}/> : <LogOut size={18}/>}
                      </div>
                      <div>
                        <span className="block font-black text-xs uppercase">{l.type === 'CHECK_IN' ? 'Ingreso' : 'Egreso'}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">{l.locationName}</span>
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
    setLoading(true); try { const [u, l] = await Promise.all([fetchUsers(), fetchLocations()]); setUsers(u); setLocations(l); } finally { setLoading(false); } 
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { 
    if (editingUser) setFormData({ ...editingUser, schedule: editingUser.schedule || [] }); 
    else setFormData({ role: 'Mozo', schedule: [], assignedLocations: [], password: '1234' }); 
  }, [editingUser, isCreating]);

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault(); if (!formData.name || !formData.dni) return alert("Nombre y DNI obligatorios");
    setFormSaving(true); try { await saveUser(formData as User); setEditingUser(null); setIsCreating(false); load(); } finally { setFormSaving(false); }
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
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div><h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Nómina de Personal</h1><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Recursos Humanos UpFest</p></div>
        <button onClick={() => setIsCreating(true)} className="bg-slate-900 text-white px-8 py-4 rounded-2xl flex items-center gap-3 shadow-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-colors"><Plus size={18} /> Nuevo Colaborador</button>
      </div>
      
      <div className="bg-white rounded-[32px] border overflow-hidden shadow-sm">
         <div className="overflow-x-auto"><table className="w-full text-left border-collapse min-w-[800px]">
           <thead><tr className="bg-slate-50 border-b"><th className="p-6 text-[10px] font-black uppercase">Colaborador</th><th className="p-6 text-[10px] font-black uppercase">Legajo / DNI</th><th className="p-6 text-[10px] font-black uppercase">Rol</th><th className="p-6 text-[10px] font-black uppercase">Sedes</th><th className="p-6 text-right">Acciones</th></tr></thead>
           <tbody className="divide-y">
             {users.map(u => (
               <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                 <td className="p-6 flex items-center gap-4"><div className="w-10 h-10 rounded-xl bg-slate-100 overflow-hidden border">{u.referenceImage && <img src={u.referenceImage} className="w-full h-full object-cover" />}</div><span className="font-black text-slate-800 uppercase text-sm">{u.name}</span></td>
                 <td className="p-6 text-xs font-bold text-slate-500 font-mono">{u.legajo || 'N/A'}<br/>DNI: {u.dni}</td>
                 <td className="p-6 text-[10px] font-black uppercase text-slate-700">{u.role}</td>
                 <td className="p-6 text-[9px] font-bold text-slate-400 max-w-xs">{u.assignedLocations?.map(id => locations.find(l => l.id === id)?.name).join(', ') || 'Sin asignar'}</td>
                 <td className="p-6 text-right"><button onClick={() => setEditingUser(u)} className="p-3 text-slate-300 hover:text-orange-600 transition-colors"><Pencil size={18}/></button></td>
               </tr>
             ))}
           </tbody>
         </table></div>
      </div>

      {(isCreating || editingUser) && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[48px] w-full max-w-5xl shadow-2xl overflow-y-auto max-h-[95vh] relative animate-in zoom-in-95 duration-300">
            <button type="button" onClick={() => { setEditingUser(null); setIsCreating(false); }} className="absolute top-8 right-8 p-3 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-400 transition-colors z-10"><X size={24}/></button>
            
            <form onSubmit={handleSaveUser} className="p-12 space-y-12">
              <div className="border-b pb-6">
                <h3 className="font-black text-4xl text-slate-900 uppercase tracking-tighter">{editingUser ? 'EDITAR COLABORADOR' : 'NUEVO COLABORADOR'}</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 italic">FICHA DE RRHH - UPFEST SYSTEMS</p>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-12">
                <div className="flex flex-col items-center gap-6">
                  <div className="w-full space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">FOTO REFERENCIA</label>
                    <div className="aspect-[4/5] w-full bg-slate-50 rounded-[32px] border-4 border-slate-100 relative overflow-hidden group">
                       {formData.referenceImage ? (
                         <img src={formData.referenceImage} className="w-full h-full object-cover" />
                       ) : (
                         <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 gap-4">
                           <ImageIcon size={64} strokeWidth={1}/>
                           <span className="text-[10px] font-black uppercase tracking-widest">Sin Imagen</span>
                         </div>
                       )}
                       <button type="button" onClick={() => fileInputRef.current?.click()} className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-black text-xs uppercase gap-2 backdrop-blur-sm"><Upload size={18}/> Cambiar Foto</button>
                    </div>
                    <input type="file" ref={fileInputRef} onChange={handleImageChange} className="hidden" accept="image/*" />
                  </div>
                </div>

                <div className="xl:col-span-2 space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="col-span-full space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">NOMBRE COMPLETO</label>
                      <input type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-5 bg-slate-50 rounded-[20px] border-none font-black text-slate-900 focus:ring-4 focus:ring-orange-500/10 outline-none uppercase" required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">DNI</label>
                      <input type="text" value={formData.dni || ''} onChange={e => setFormData({...formData, dni: e.target.value})} className="w-full p-5 bg-slate-50 rounded-[20px] border-none font-black text-slate-900 focus:ring-4 focus:ring-orange-500/10 outline-none" required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">LEGAJO / ID</label>
                      <input type="text" value={formData.legajo || ''} onChange={e => setFormData({...formData, legajo: e.target.value})} className="w-full p-5 bg-slate-50 rounded-[20px] border-none font-black text-slate-900 focus:ring-4 focus:ring-orange-500/10 outline-none" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">CONTRASEÑA</label>
                      <input type="text" value={formData.password || ''} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full p-5 bg-slate-50 rounded-[20px] border-none font-black text-slate-900 focus:ring-4 focus:ring-orange-500/10 outline-none" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">ROL / PUESTO</label>
                      <select value={formData.role || 'Mozo'} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full p-5 bg-slate-50 rounded-[20px] border-none font-black text-slate-900 focus:ring-4 focus:ring-orange-500/10 outline-none appearance-none">
                        {DEFAULT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-slate-400"><Shirt size={16}/><label className="text-[10px] font-black uppercase tracking-widest">CÓDIGO DE VESTIMENTA</label></div>
                      <textarea value={formData.dressCode || ''} onChange={e => setFormData({...formData, dressCode: e.target.value})} className="w-full p-6 bg-slate-50 rounded-[28px] border-none font-black text-slate-900 h-32 focus:ring-4 focus:ring-orange-500/10 outline-none text-sm" placeholder="Ej: Remera negra lisa, pantalón oscuro..." />
                    </div>
                    <div className="space-y-3 flex flex-col">
                      <div className="flex items-center gap-2 text-slate-400"><MapPin size={16}/><label className="text-[10px] font-black uppercase tracking-widest">SEDES ASIGNADAS</label></div>
                      <div className="flex-1 p-6 bg-slate-50 rounded-[28px] border-none overflow-y-auto max-h-32 space-y-2 scrollbar-thin">
                        {locations.map(loc => (
                          <label key={loc.id} className="flex items-center gap-3 cursor-pointer group">
                            <input type="checkbox" className="w-5 h-5 rounded-md border-none bg-white text-orange-600 focus:ring-0" checked={formData.assignedLocations?.includes(loc.id)} onChange={e => {
                              const ids = formData.assignedLocations || [];
                              setFormData({...formData, assignedLocations: e.target.checked ? [...ids, loc.id] : ids.filter(id => id !== loc.id)});
                            }} />
                            <span className="text-[11px] font-black uppercase text-slate-600 group-hover:text-slate-900 transition-colors">{loc.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50/50 p-10 rounded-[40px] border border-slate-100 space-y-8">
                 <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-slate-900">
                      <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center"><Clock size={20}/></div>
                      <h4 className="font-black text-xl uppercase tracking-tighter">Horarios de Trabajo</h4>
                    </div>
                    <button type="button" onClick={addSchedule} className="bg-white border text-slate-900 px-6 py-3 rounded-2xl flex items-center gap-3 shadow-sm font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-colors"><Plus size={16}/> Agregar Franja</button>
                 </div>

                 <div className="grid grid-cols-1 gap-4">
                    {(!formData.schedule || formData.schedule.length === 0) ? (
                      <div className="py-12 text-center border-4 border-dashed rounded-[32px] border-slate-100">
                        <Calendar size={48} className="mx-auto text-slate-100 mb-4" strokeWidth={1}/>
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No hay horarios definidos para este colaborador</p>
                      </div>
                    ) : (
                      formData.schedule.map((slot, idx) => (
                        <div key={idx} className="bg-white p-6 rounded-[28px] shadow-sm border border-slate-100 grid grid-cols-1 md:grid-cols-11 gap-4 items-center animate-in slide-in-from-right-4 duration-200">
                           <div className="md:col-span-2 space-y-1">
                             <label className="text-[8px] font-black text-slate-400 uppercase">Día Inicio</label>
                             <select value={slot.startDay} onChange={e => updateSchedule(idx, 'startDay', e.target.value)} className="w-full bg-slate-50 p-3 rounded-xl border-none font-bold text-[10px] appearance-none">
                               {DAYS_OF_WEEK.map(d => <option key={d} value={d}>{d}</option>)}
                             </select>
                           </div>
                           <div className="md:col-span-2 space-y-1">
                             <label className="text-[8px] font-black text-slate-400 uppercase">Hora Ingreso</label>
                             <input type="time" value={slot.startTime} onChange={e => updateSchedule(idx, 'startTime', e.target.value)} className="w-full bg-slate-50 p-3 rounded-xl border-none font-bold text-[10px]" />
                           </div>
                           <div className="md:col-span-1 flex justify-center text-slate-200 pt-4"><ArrowRight size={24}/></div>
                           <div className="md:col-span-2 space-y-1">
                             <label className="text-[8px] font-black text-slate-400 uppercase">Día Fin</label>
                             <select value={slot.endDay} onChange={e => updateSchedule(idx, 'endDay', e.target.value)} className="w-full bg-slate-50 p-3 rounded-xl border-none font-bold text-[10px] appearance-none">
                               {DAYS_OF_WEEK.map(d => <option key={d} value={d}>{d}</option>)}
                             </select>
                           </div>
                           <div className="md:col-span-2 space-y-1">
                             <label className="text-[8px] font-black text-slate-400 uppercase">Hora Salida</label>
                             <input type="time" value={slot.endTime} onChange={e => updateSchedule(idx, 'endTime', e.target.value)} className="w-full bg-slate-50 p-3 rounded-xl border-none font-bold text-[10px]" />
                           </div>
                           <div className="md:col-span-2 flex justify-end pt-4">
                             <button type="button" onClick={() => removeSchedule(idx)} className="p-4 text-red-100 hover:text-red-500 transition-colors"><Trash2 size={20}/></button>
                           </div>
                        </div>
                      ))
                    )}
                 </div>
              </div>

              <div className="flex flex-col md:flex-row gap-4 pt-6">
                <button type="button" onClick={() => { setEditingUser(null); setIsCreating(false); }} className="flex-1 py-6 bg-white border border-slate-200 text-slate-400 rounded-[28px] font-black uppercase tracking-widest hover:bg-slate-50 transition-colors">CANCELAR</button>
                <button type="submit" disabled={formSaving} className="flex-[2] py-6 bg-slate-900 text-white rounded-[28px] font-black uppercase tracking-widest shadow-2xl hover:bg-slate-800 transition-all flex items-center justify-center gap-3">
                  {formSaving ? <RefreshCw className="animate-spin"/> : <><Save size={20}/> GUARDAR CAMBIOS</>}
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
    const load = async () => { setLoading(true); try { setLocations(await fetchLocations()); } finally { setLoading(false); } };
    useEffect(() => { load(); }, []);

    const linkTerminal = (locId: string) => {
      localStorage.setItem('upfest_terminal_location_id', locId);
      setCurrentLocId(locId);
      alert(`Terminal vinculada con éxito.`);
    };

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-8 animate-in fade-in">
            <h1 className="text-3xl font-black text-slate-900 mb-8 uppercase tracking-tighter">Gestión de Sedes (Salones)</h1>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {loading ? <div className="col-span-full py-20 text-center text-slate-400 font-bold uppercase tracking-widest">Cargando Salones...</div> : locations.map(loc => (
                <div key={loc.id} className={`p-8 bg-white border rounded-[40px] shadow-sm transition-all ${currentLocId === loc.id ? 'border-orange-500 ring-8 ring-orange-50' : 'border-slate-100 hover:shadow-xl'}`}>
                  <div className={`w-16 h-16 rounded-[24px] flex items-center justify-center mb-6 ${currentLocId === loc.id ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-400'}`}><Building size={32}/></div>
                  <h3 className="font-black text-2xl text-slate-900 uppercase tracking-tighter mb-2">{loc.name}</h3>
                  <p className="text-xs font-bold text-slate-500 mb-1 flex items-center gap-2"><MapPin size={14}/> {loc.address}</p>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8">{loc.city}</p>
                  <div className="pt-6 border-t flex gap-2">
                    <button onClick={() => linkTerminal(loc.id)} className={`flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${currentLocId === loc.id ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-900 text-white shadow-lg shadow-slate-200'}`}>
                      {currentLocId === loc.id ? 'VINCULADA' : 'VINCULAR'}
                    </button>
                    <button onClick={async () => { if(confirm('¿Borrar sede?')) { await deleteLocation(loc.id); load(); } }} className="p-4 bg-slate-50 text-slate-300 hover:text-red-500 rounded-2xl transition-colors"><Trash2 size={18}/></button>
                  </div>
                </div>
              ))}
            </div>
        </div>
    );
};

// --- Sidebar y Layout ---
const Sidebar = ({ activeTab, setActiveTab, currentUser, onLogout, logoUrl, isMobileMenuOpen, setIsMobileMenuOpen }: any) => {
  const NavButton = ({ tab, icon: Icon, label }: any) => (<button onClick={() => { setActiveTab(tab); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-4 px-6 py-4 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition ${activeTab === tab ? 'bg-orange-50 text-orange-700' : 'text-slate-400 hover:bg-slate-50'}`}><Icon size={20}/> {label}</button>);
  return (<><aside className={`fixed inset-y-0 left-0 z-[100] w-72 bg-white border-r border-slate-200 transform transition-transform duration-300 md:translate-x-0 md:static h-screen flex flex-col ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}><div className="p-10 border-b flex flex-col items-center">{logoUrl ? <img src={logoUrl} className="h-16 mb-4 object-contain" /> : <div className="w-16 h-16 bg-slate-900 text-white rounded-[24px] flex items-center justify-center font-black text-2xl mb-4">UP</div>}<span className="font-black text-slate-900 tracking-tighter text-2xl">UPFEST</span></div><nav className="flex-1 p-8 space-y-2 overflow-y-auto"><NavButton tab="clock" icon={Clock} label={currentUser.role === 'Admin' ? 'Monitor' : 'Fichadas'} />{currentUser.role === 'Admin' && (<><NavButton tab="admin" icon={Users} label="RRHH / Nómina" /><NavButton tab="locations" icon={Building} label="Salones / Sedes" /></>)}</nav><div className="p-8 border-t space-y-2">{currentUser.role === 'Admin' && (<button onClick={handleOpenApiKeyDialog} className="w-full flex items-center gap-4 px-6 py-3 rounded-[20px] text-[9px] font-black uppercase text-slate-400 border border-dashed hover:border-orange-500 transition-colors"><Key size={18} /> Llave AI</button>)}<button onClick={onLogout} className="w-full flex items-center gap-4 px-6 py-4 rounded-[20px] text-[10px] font-black uppercase text-red-400 hover:bg-red-50 transition-colors"><LogOut size={20} /> Salir</button></div></aside></>);
};

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('clock');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  useEffect(() => { fetchCompanyLogo().then(setLogoUrl); }, []);
  if (!currentUser) return <LoginView onLogin={(u: User) => { setCurrentUser(u); setActiveTab('clock'); }} logoUrl={logoUrl} />;
  return (<div className="min-h-screen bg-slate-50 flex flex-col md:flex-row overflow-hidden text-slate-900"><Sidebar activeTab={activeTab} setActiveTab={setActiveTab} currentUser={currentUser} onLogout={() => setCurrentUser(null)} logoUrl={logoUrl} isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen}/><div className="flex-1 flex flex-col h-screen overflow-hidden"><header className="md:hidden bg-white border-b px-6 py-4 flex items-center justify-between z-40 shrink-0"><button onClick={() => setIsMobileMenuOpen(true)} className="p-2"><Menu size={24}/></button><span className="font-black text-lg">UPFEST</span><div className="w-10"></div></header><main className="flex-1 overflow-y-auto">{activeTab === 'clock' && <ClockView user={currentUser} onLogout={() => setCurrentUser(null)} />}{activeTab === 'admin' && <AdminDashboard />}{activeTab === 'locations' && <LocationsDashboard />}</main></div></div>);
}

const LoginView = ({ onLogin, logoUrl }: { onLogin: (u: User) => void, logoUrl: string | null }) => {
  const [dni, setDni] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const handleLogin = async (e: React.FormEvent) => { e.preventDefault(); setLoading(true); try { const user = await authenticateUser(dni, password); if (user) onLogin(user); else setError('DNI O CLAVE INCORRECTO'); } finally { setLoading(false); } };
  return (<div className="min-h-screen flex items-center justify-center p-6 bg-slate-50"><div className="w-full max-w-sm bg-white rounded-[48px] shadow-2xl p-14 border relative overflow-hidden"><div className="absolute top-0 left-0 w-full h-2 bg-orange-600"></div><div className="text-center">{logoUrl ? <img src={logoUrl} className="h-20 mx-auto mb-8 object-contain" /> : <div className="w-24 h-24 bg-slate-900 rounded-[32px] flex items-center justify-center mx-auto mb-8 text-white font-black text-4xl shadow-2xl">UP</div>}<h2 className="text-3xl font-black mb-2 uppercase tracking-tighter">UPFEST</h2><p className="text-slate-400 font-black text-[10px] uppercase tracking-widest">CONTROL BIOMÉTRICO</p></div><form onSubmit={handleLogin} className="space-y-6 mt-12"><input type="text" value={dni} onChange={e => setDni(e.target.value)} className="w-full px-8 py-5 border border-slate-200 rounded-[20px] font-bold outline-none focus:ring-4 focus:ring-orange-500/5 transition-all" placeholder="DNI" /><input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-8 py-5 border border-slate-200 rounded-[20px] font-bold outline-none focus:ring-4 focus:ring-orange-500/5 transition-all" placeholder="CLAVE" />{error && <div className="text-red-500 text-[10px] font-black text-center uppercase">{error}</div>}<button type="submit" disabled={loading} className="w-full bg-slate-900 text-white font-black py-5 rounded-[20px] shadow-xl hover:bg-slate-800 transition-all disabled:opacity-50">{loading ? 'CONECTANDO...' : 'INGRESAR'}</button></form></div></div>);
};
