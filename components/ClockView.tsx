import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Camera, CheckCircle, RefreshCw, ArrowRight, AlertTriangle, Settings, User as UserIcon 
} from 'lucide-react';
import { User, Location, LogEntry } from '../types';
import { 
  getCurrentPosition, calculateDistance, isWithinSchedule, uploadImage, 
  fetchUsers, fetchLocations, fetchLogs, fetchTodayLogs, fetchLogsByDateRange, 
  addLog, updateLog, checkDatabaseHealth, getReliableTime, getPendingSyncCount, 
  syncPendingLogs, queuePendingPhoto, fetchLastLog 
} from '../services/utils';
import { analyzeCheckIn } from '../services/geminiService';
import { AdminMonitor } from './AdminMonitor';
import { useFeedback } from '../services/feedbackContext';

interface ClockViewProps {
  user: User;
  onLogout: () => void;
}

export const ClockView: React.FC<ClockViewProps> = ({ user, onLogout }) => {
  const { toast } = useFeedback();

  const [locations, setLocations] = useState<Location[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [deviceLocation, setDeviceLocation] = useState<Location | null>(null);

  // Terminal state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [clockType, setClockType] = useState<'CHECK_IN' | 'CHECK_OUT'>('CHECK_IN');
  const [timeDiffWarning, setTimeDiffWarning] = useState<number | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(getPendingSyncCount());
  const [successAction, setSuccessAction] = useState<{ type: string; countdown: number } | null>(null);

  // Admin logs state
  const [adminLogs, setAdminLogs] = useState<LogEntry[]>([]);
  const [displayLogs, setDisplayLogs] = useState<LogEntry[]>([]);
  const [isFiltering, setIsFiltering] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Pending sync counter listener
  useEffect(() => {
    const handlePendingUpdate = () => {
      setPendingSyncCount(getPendingSyncCount());
    };
    handlePendingUpdate();
    window.addEventListener('pending-sync-updated', handlePendingUpdate);
    const interval = setInterval(handlePendingUpdate, 4000);
    return () => {
      window.removeEventListener('pending-sync-updated', handlePendingUpdate);
      clearInterval(interval);
    };
  }, []);

  // Success countdown
  useEffect(() => {
    if (!successAction) return;

    const timer = setInterval(() => {
      setSuccessAction((prev) => {
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

  // Load data
  const loadData = useCallback(
    async (forceServer = false, sDate?: string, eDate?: string) => {
      try {
        setFetchError(null);
        if (user.role === 'Admin') {
          setIsFiltering(true);
          let fetchedLogs: LogEntry[] = [];
          if (sDate && eDate) {
            const start = new Date(`${sDate}T00:00:00`);
            const end = new Date(`${eDate}T23:59:59`);
            fetchedLogs = await fetchLogsByDateRange(start, end);
          } else {
            fetchedLogs = await fetchLogs();
          }
          setAdminLogs(fetchedLogs);
          setDisplayLogs(fetchedLogs);
        }
      } catch (err: any) {
        setFetchError(err.message || 'Error al consultar logs');
      } finally {
        setIsFiltering(false);
      }
    },
    [user.role]
  );

  useEffect(() => {
    fetchLocations().then((locs) => {
      setLocations(locs);
      const storedTerminalId = localStorage.getItem('upfest_terminal_location_id');
      if (storedTerminalId) {
        const found = locs.find((l) => l.id === storedTerminalId);
        if (found) setDeviceLocation(found);
      }
    });
    fetchUsers().then(setAllUsers);
    loadData();
  }, [loadData]);

  // Camera management
  useEffect(() => {
    let active = true;
    async function startCamera() {
      if (cameraActive) {
        setCameraError(null);
        try {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Tu navegador o dispositivo no soporta acceso a la cámara.');
          }
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: 'user',
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });

          if (active && videoRef.current) {
            streamRef.current = stream;
            videoRef.current.srcObject = stream;
          } else {
            stream.getTracks().forEach((t) => t.stop());
          }
        } catch (err: any) {
          console.error('Error al iniciar cámara:', err);
          if (active) {
            setCameraActive(false);
            setCameraError(err.message || 'Error al acceder a la cámara.');
          }
        }
      } else {
        stopCamera();
      }
    }
    startCamera();
    return () => {
      active = false;
      stopCamera();
    };
  }, [cameraActive]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const capturePhoto = async () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current || document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const context = canvas.getContext('2d');
      if (context) {
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

          // Deducir sugerencia de Ingreso/Egreso
          try {
            const last = await fetchLastLog(user.id);
            let suggested: 'CHECK_IN' | 'CHECK_OUT' = 'CHECK_IN';
            if (last && last.type === 'CHECK_IN') {
              const diffHours = (Date.now() - new Date(last.timestamp).getTime()) / 3600000;
              if (diffHours > 14) {
                suggested = 'CHECK_IN'; // Probable olvido de egreso anterior
              } else if (diffHours < 20) {
                suggested = 'CHECK_OUT';
              } else {
                suggested = 'CHECK_IN';
              }
            } else {
              suggested = 'CHECK_IN';
            }
            setClockType(suggested);
          } catch (e) {
            setClockType('CHECK_IN');
          }
        }
      }
    }
  };

  const handleClockAction = async () => {
    if (!photo) return;
    setLoading(true);
    setLoadingMsg('Procesando...');

    try {
      let currentDeviceLocation = deviceLocation;
      if (!currentDeviceLocation) {
        const storedId = localStorage.getItem('upfest_terminal_location_id');
        if (storedId) {
          currentDeviceLocation = locations.find((l) => l.id === storedId) || null;
          if (currentDeviceLocation) setDeviceLocation(currentDeviceLocation);
        }
      }

      // 1. GPS con timeout
      const gpsPromise = new Promise<GeolocationPosition | null>((resolve) => {
        const timeout = setTimeout(() => resolve(null), 3500);
        getCurrentPosition()
          .then((pos) => {
            clearTimeout(timeout);
            resolve(pos);
          })
          .catch(() => {
            clearTimeout(timeout);
            resolve(null);
          });
      });

      // 2. Hora confiable del servidor y ubicación
      const [pos, timeResult] = await Promise.all([gpsPromise, getReliableTime()]);

      if (timeResult.diffMinutes > 5) {
        setTimeDiffWarning(timeResult.diffMinutes);
      }

      // 3. Determinar estado de ubicación
      let locStatus: 'VALID' | 'INVALID' | 'SKIPPED' = 'SKIPPED';
      if (pos && currentDeviceLocation) {
        const dist = calculateDistance(
          pos.coords.latitude,
          pos.coords.longitude,
          currentDeviceLocation.lat,
          currentDeviceLocation.lng
        );
        locStatus = dist <= currentDeviceLocation.radiusMeters ? 'VALID' : 'INVALID';
      }

      // 4. Tipo de fichada seleccionado por el usuario
      const type = clockType;

      let initialFeedback = 'Procesando evidencia...';
      if (timeResult.isDeviceTime) {
        initialFeedback += ' (hora de dispositivo)';
      }

      // 5. Crear log preliminar
      const preliminaryLog: Omit<LogEntry, 'id'> = {
        userId: user.id,
        userName: user.name,
        legajo: user.legajo,
        timestamp: timeResult.timestamp,
        type,
        locationId: currentDeviceLocation?.id || 'manual',
        locationName: currentDeviceLocation?.name || 'Manual',
        locationStatus: locStatus,
        dressCodeStatus: 'PENDING',
        identityStatus: 'SKIPPED',
        photoEvidence: '',
        aiFeedback: initialFeedback,
        scheduleStatus: isWithinSchedule(user.schedule) ? 'ON_TIME' : 'OFF_SCHEDULE',
      };

      const savedLogId = await addLog(preliminaryLog as LogEntry);

      // 6. Feedback inmediato
      const currentPhoto = photo;
      setPhoto(null);
      setSuccessAction({ type: type === 'CHECK_IN' ? 'INGRESO' : 'EGRESO', countdown: 7 });
      setLoading(false);

      // 7. Segundo plano: subir foto y correr IA
      (async () => {
        try {
          const timestamp = Date.now();
          const fileName = `logs/${user.id}_${timestamp}.jpg`;
          let finalPhotoUrl = '';

          try {
            finalPhotoUrl = await uploadImage(currentPhoto, 'fichadas', fileName);
          } catch (uploadErr) {
            console.error('Error al subir foto de fichada a Supabase:', uploadErr);
            let feedback = 'Foto pendiente de subida';
            if (timeResult.isDeviceTime) feedback += ' (hora de dispositivo)';

            await updateLog({
              ...preliminaryLog,
              id: savedLogId,
              photoEvidence: '',
              dressCodeStatus: 'PENDING',
              identityStatus: 'SKIPPED',
              aiFeedback: feedback,
            } as LogEntry);

            await queuePendingPhoto({
              logId: savedLogId,
              userId: user.id,
              photoBase64: currentPhoto,
              dressCode: user.dressCode || '',
            });

            loadData();
            return;
          }

          // Análisis IA
          let iaResult;
          if (user.role === 'Invitado') {
            iaResult = { aiAvailable: true, dressCodeMatches: true, identityMatch: true, description: 'Invitado - Sin validación IA' };
          } else {
            iaResult = await analyzeCheckIn(currentPhoto, user.dressCode, user.photoRef || null);
          }

          const dressCodeStatus: 'PASS' | 'FAIL' | 'SKIPPED' = iaResult.aiAvailable
            ? iaResult.dressCodeMatches
              ? 'PASS'
              : 'FAIL'
            : 'SKIPPED';

          let feedbackText = iaResult.description;
          if (timeResult.isDeviceTime) {
            feedbackText += ' (hora de dispositivo)';
          }

          await updateLog({
            ...preliminaryLog,
            id: savedLogId,
            photoEvidence: finalPhotoUrl,
            dressCodeStatus,
            identityStatus: 'SKIPPED',
            aiFeedback: feedbackText,
          } as LogEntry);

          loadData();
        } catch (bgErr) {
          console.error('Error en procesamiento en segundo plano:', bgErr);
        }
      })();
    } catch (err: any) {
      toast('Error al registrar fichada: ' + err.message, 'error');
      setLoading(false);
    }
  };

  // Si el usuario es Admin, renderizamos el Monitor de Admin
  if (user.role === 'Admin') {
    return (
      <AdminMonitor
        adminLogs={adminLogs}
        displayLogs={displayLogs}
        setDisplayLogs={setDisplayLogs}
        allUsers={allUsers}
        locations={locations}
        loadData={loadData}
        isFiltering={isFiltering}
        fetchError={fetchError}
        pendingSyncCount={pendingSyncCount}
      />
    );
  }

  // Vista de fichada del colaborador
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
            <p className="text-lg md:text-xl font-black text-slate-300 uppercase tracking-[0.3em]">
              Redirigiendo en {successAction.countdown} segundos...
            </p>
          </div>
          <button
            onClick={onLogout}
            className="text-sm font-black uppercase text-slate-400 hover:text-white border-b-2 border-slate-700 hover:border-white transition-all pb-1 tracking-[0.2em]"
          >
            Cerrar sesión ahora
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-[32px] md:rounded-[40px] p-8 border shadow-xl flex flex-col min-h-[500px]">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-black uppercase tracking-tighter">Fichador</h2>
            {deviceLocation ? (
              <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">
                {deviceLocation.name}
              </span>
            ) : (
              <span className="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest animate-pulse">
                ⚠️ NO VINCULADA (Manual)
              </span>
            )}
          </div>

          {/* Indicador de Fichadas Pendientes en pantalla de fichada */}
          {pendingSyncCount > 0 && (
            <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between text-amber-800">
              <div className="flex items-center gap-2">
                <RefreshCw size={14} className="animate-spin text-amber-600" />
                <span className="text-[10px] font-black uppercase tracking-wider">
                  {pendingSyncCount} {pendingSyncCount === 1 ? 'fichada pendiente' : 'fichadas pendientes'} de sincronizar
                </span>
              </div>
              <button
                type="button"
                onClick={() => syncPendingLogs()}
                className="text-[9px] font-black uppercase tracking-wider bg-amber-200/70 hover:bg-amber-200 text-amber-900 px-2.5 py-1 rounded-lg transition-colors"
              >
                Sincronizar
              </button>
            </div>
          )}

          {/* Advertencia si la diferencia horaria supera los 5 minutos */}
          {timeDiffWarning !== null && timeDiffWarning > 5 && (
            <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-800">
              <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider leading-snug">
                  Advertencia de hora del dispositivo
                </p>
                <p className="text-[10px] text-amber-700 font-medium mt-0.5">
                  La hora de este equipo difiere por {Math.round(timeDiffWarning)} minutos de la hora del servidor. Ajusta la hora y zona horaria (GMT-3).
                </p>
              </div>
            </div>
          )}

          <div className="w-full h-auto aspect-square min-h-[300px] md:min-h-[350px] rounded-[32px] overflow-hidden bg-slate-900 mb-6 relative border-4 border-slate-100 shadow-inner flex items-center justify-center">
            {!cameraActive && !photo && (
              <button
                onClick={() => setCameraActive(true)}
                className="absolute inset-0 w-full h-full text-white font-black uppercase text-xs flex flex-col items-center justify-center gap-6 hover:bg-slate-800 transition-colors px-10 text-center z-20"
              >
                <div className="w-24 h-24 rounded-full bg-orange-600 flex items-center justify-center shadow-2xl ring-[12px] ring-orange-50/10 mb-2 active:scale-90 transition-transform">
                  <Camera size={40} />
                </div>
                <span className="tracking-[0.2em] text-sm">Activar Cámara</span>
                {cameraError && (
                  <div className="p-4 bg-rose-500/20 backdrop-blur-md rounded-2xl border border-rose-500/50 mt-4">
                    <p className="text-rose-200 text-[10px] leading-tight font-bold">{cameraError}</p>
                  </div>
                )}
              </button>
            )}
            {cameraActive && <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover scale-x-[-1]" />}
            {photo && <img src={photo} alt="Foto capturada" className="w-full h-full object-cover" />}
            {loading && (
              <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center text-white p-6 text-center z-[30]">
                <RefreshCw className="animate-spin mb-4" size={32} />
                <p className="font-black text-[10px] uppercase tracking-widest">{loadingMsg || 'Procesando...'}</p>
              </div>
            )}
          </div>
          <div className="space-y-3 mt-auto">
            {cameraActive && (
              <button
                onClick={capturePhoto}
                className="w-full py-6 bg-orange-600 text-white rounded-[24px] font-black uppercase tracking-[0.2em] text-xs shadow-xl transition-all active:scale-95"
              >
                Capturar Foto
              </button>
            )}

            {photo && !loading && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-[24px] space-y-3">
                <div className="text-center">
                  <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest block">Vas a registrar:</span>
                  <span
                    className={`text-xl font-black uppercase tracking-tight ${
                      clockType === 'CHECK_IN' ? 'text-emerald-600' : 'text-slate-800'
                    }`}
                  >
                    {clockType === 'CHECK_IN' ? 'INGRESO' : 'EGRESO'}
                  </span>
                </div>
                <div className="flex bg-slate-200 p-1 rounded-2xl gap-1">
                  <button
                    type="button"
                    onClick={() => setClockType('CHECK_IN')}
                    className={`flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${
                      clockType === 'CHECK_IN' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Ingreso
                  </button>
                  <button
                    type="button"
                    onClick={() => setClockType('CHECK_OUT')}
                    className={`flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${
                      clockType === 'CHECK_OUT' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Egreso
                  </button>
                </div>
              </div>
            )}

            {photo && !loading && (
              <button
                onClick={handleClockAction}
                className="w-full py-6 bg-slate-900 text-white rounded-[24px] font-black uppercase tracking-[0.2em] text-xs shadow-xl flex items-center justify-center gap-3"
              >
                Confirmar Fichada <ArrowRight size={20} />
              </button>
            )}
            {photo && !loading && (
              <button
                onClick={() => {
                  setPhoto(null);
                  setCameraActive(true);
                }}
                className="w-full py-4 bg-slate-100 text-slate-500 rounded-[20px] font-black uppercase text-[10px] tracking-widest"
              >
                Tomar otra foto
              </button>
            )}
          </div>

          <div className="mt-4 flex justify-center">
            <button
              onClick={async () => {
                const isDateValid = new Date().getFullYear() >= 2024;
                const isOnline = navigator.onLine;
                let dbStatus = 'Desconocido';
                try {
                  const healthy = await checkDatabaseHealth();
                  dbStatus = healthy ? 'CONECTADA' : 'ERROR';
                } catch (e) {
                  dbStatus = 'ERROR';
                }

                alert(
                  `DIAGNÓSTICO DE TABLET:\n\n` +
                    `📅 Fecha del Dispositivo: ${new Date().toLocaleString()}\n` +
                    `   Zona Horaria: GMT${-new Date().getTimezoneOffset() / 60}\n` +
                    `   ${isDateValid ? '✅ Año Correcto' : '❌ AÑO INCORRECTO (Ajustar fecha y hora)'}\n\n` +
                    `🌐 Internet: ${isOnline ? '✅ Conectado' : '❌ Desconectado'}\n` +
                    `🗄️ Base de Datos: ${dbStatus === 'CONECTADA' ? '✅ Conectada' : '❌ Error de Conexión'}\n\n` +
                    `📍 GPS: ${deviceLocation ? '✅ Activo' : '⚠️ Buscando...'}\n` +
                    `📷 Cámara: ${cameraError ? '❌ Error' : '✅ Lista'}\n\n` +
                    `Si la hora de las fichadas sale mal, verifica que la hora de la tablet coincida con la hora real y que la zona horaria sea GMT-3 (Buenos Aires).`
                );
              }}
              className="text-[9px] font-black uppercase text-slate-400 tracking-widest hover:text-slate-600 flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-full border border-slate-100"
            >
              <Settings size={12} /> Diagnóstico de Problemas
            </button>
          </div>
        </div>

        {/* Info card del colaborador */}
        <div className="bg-white rounded-[32px] md:rounded-[40px] p-8 border shadow-xl flex flex-col justify-between">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center font-black text-2xl">
                {user.name.charAt(0)}
              </div>
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tight text-slate-900">{user.name}</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  DNI: {user.dni} | Rol: {user.role}
                </p>
              </div>
            </div>

            <div className="p-6 bg-slate-50 rounded-2xl space-y-3 border border-slate-100">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Código de Vestimenta</p>
              <p className="text-xs text-slate-700 font-medium leading-relaxed">
                {user.dressCode || 'Uniforme estándar'}
              </p>
            </div>
          </div>

          <div className="pt-8 border-t flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Sesión de empleado</span>
            <button
              onClick={onLogout}
              className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase tracking-widest transition-colors"
            >
              Salir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
