import React, { useState } from 'react';
import { 
  Monitor, RefreshCw, CalendarPlus, Download, Bell, TimerOff, 
  Sparkles, Filter, Clock, RotateCcw, Calendar, Briefcase, 
  XOctagon, Search, FileText, User as UserIcon, Pencil, Trash2, AlertTriangle 
} from 'lucide-react';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { Location, LogEntry, User } from '../types';
import { updateLog, deleteLog, syncPendingLogs } from '../services/utils';
import { analyzeCheckIn } from '../services/geminiService';
import { formatMinutes, getShiftDuration, getNoExitLogs } from '../services/shiftHelpers';
import { exportAttendanceReport } from '../services/excelExport';
import { useFeedback } from '../services/feedbackContext';
import { ManualLogModal } from './modals/ManualLogModal';
import { EditLogModal } from './modals/EditLogModal';
import { IncidentsModal } from './modals/IncidentsModal';
import { NoExitsModal } from './modals/NoExitsModal';
import { ZoomedImageModal } from './modals/ZoomedImageModal';

interface AdminMonitorProps {
  adminLogs: LogEntry[];
  displayLogs: LogEntry[];
  setDisplayLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>;
  allUsers: User[];
  locations: Location[];
  loadData: (forceServer?: boolean, sDate?: string, eDate?: string) => Promise<void>;
  isFiltering: boolean;
  fetchError: string | null;
  pendingSyncCount: number;
}

export const AdminMonitor: React.FC<AdminMonitorProps> = ({
  adminLogs,
  displayLogs,
  setDisplayLogs,
  allUsers,
  locations,
  loadData,
  isFiltering,
  fetchError,
  pendingSyncCount,
}) => {
  const { toast, confirm } = useFeedback();

  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [activeQuickFilter, setActiveQuickFilter] = useState<string | null>(null);
  const [personSearchTerm, setPersonSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isRevalidating, setIsRevalidating] = useState<string | null>(null);
  const [isReprocessing, setIsReprocessing] = useState(false);

  // Modals state
  const [showManualLogModal, setShowManualLogModal] = useState(false);
  const [showEditLogModal, setShowEditLogModal] = useState(false);
  const [editingLog, setEditingLog] = useState<LogEntry | null>(null);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showNoExitsModal, setShowNoExitsModal] = useState(false);

  const incidentLogs = adminLogs.filter((l) => l.dressCodeStatus === 'FAIL');
  const noExitLogs = getNoExitLogs(adminLogs);

  const applyQuickFilter = (type: 'today' | 'yesterday' | 'week' | 'month') => {
    const timeZone = 'America/Argentina/Buenos_Aires';
    const zonedNow = toZonedTime(new Date(), timeZone);
    let start = new Date(zonedNow);
    let end = new Date(zonedNow);

    setActiveQuickFilter(type);

    switch (type) {
      case 'today':
        break;
      case 'yesterday':
        start.setDate(zonedNow.getDate() - 1);
        end.setDate(zonedNow.getDate() - 1);
        break;
      case 'week':
        start.setDate(zonedNow.getDate() - 6);
        break;
      case 'month':
        start.setDate(1);
        break;
    }

    const s = formatInTimeZone(start, timeZone, 'yyyy-MM-dd');
    const e = formatInTimeZone(end, timeZone, 'yyyy-MM-dd');
    setFilterStartDate(s);
    setFilterEndDate(e);
    loadData(true, s, e);
  };

  const handleApplyFilter = () => {
    if (filterStartDate && filterEndDate) {
      setActiveQuickFilter(null);
      loadData(true);
    }
  };

  const handleClearFilter = () => {
    setFilterStartDate('');
    setFilterEndDate('');
    setActiveQuickFilter(null);
    setPersonSearchTerm('');
    loadData(true, '', '');
  };

  const handleExportExcel = async () => {
    try {
      await exportAttendanceReport(adminLogs, allUsers);
      toast('Reporte Excel generado correctamente.', 'success');
    } catch (err: any) {
      toast('Error al exportar reporte: ' + err.message, 'error');
    }
  };

  const handleDeleteLog = async (logId: string) => {
    const ok = await confirm('¿Confirmas que deseas eliminar esta fichada?', {
      title: 'Eliminar Fichada',
      isDestructive: true,
      confirmText: 'Eliminar',
    });
    if (!ok) return;

    setIsDeleting(logId);
    try {
      await deleteLog(logId);
      setDisplayLogs((prev) => prev.filter((l) => l.id !== logId));
      toast('Fichada eliminada correctamente.', 'success');
      loadData(true);
    } catch (e: any) {
      toast('Error al eliminar: ' + e.message, 'error');
    } finally {
      setIsDeleting(null);
    }
  };

  const handleRevalidateLog = async (log: LogEntry) => {
    const ok = await confirm('¿Confirmas revalidar esta fichada con IA?', {
      title: 'Revalidar Fichada',
      confirmText: 'Revalidar',
    });
    if (!ok) return;

    setIsRevalidating(log.id);
    try {
      const userObj = allUsers.find((u) => u.id === log.userId);
      const userRef = userObj?.photoRef || null;

      if (!userRef && userObj?.role !== 'Invitado') {
        toast('No se encontró foto de referencia para el usuario.', 'warning');
        return;
      }

      const userDressCode = userObj?.dressCode || 'N/A';
      let validationResult;
      if (userObj?.role === 'Invitado') {
        validationResult = { aiAvailable: true, dressCodeMatches: true, identityMatch: true, description: 'Invitado - Sin validación IA' };
      } else {
        validationResult = await analyzeCheckIn(log.photoEvidence, userDressCode, userRef || null);
      }

      const dressCodeStatus: 'PASS' | 'FAIL' | 'SKIPPED' = validationResult.aiAvailable
        ? validationResult.dressCodeMatches
          ? 'PASS'
          : 'FAIL'
        : 'SKIPPED';

      const updatedLog: LogEntry = {
        ...log,
        dressCodeStatus,
        identityStatus: 'SKIPPED',
        aiFeedback: validationResult.description,
      };

      await updateLog(updatedLog);
      setDisplayLogs((prev) => prev.map((l) => (l.id === updatedLog.id ? updatedLog : l)));
      toast('Fichada revalidada con éxito.', 'success');
      loadData();
    } catch (error: any) {
      console.error('Error al revalidar fichada:', error);
      toast('Error al revalidar: ' + (error.message || error), 'error');
    } finally {
      setIsRevalidating(null);
    }
  };

  const handleReprocessPending = async () => {
    const pendingLogs = adminLogs.filter(
      (l) => l.dressCodeStatus === 'PENDING' && l.photoEvidence && l.photoEvidence.trim() !== '' && l.photoEvidence !== 'manual'
    );

    if (pendingLogs.length === 0) {
      toast('No hay fichadas pendientes con foto para reprocesar.', 'info');
      return;
    }

    const ok = await confirm(`¿Deseas reprocesar con IA las ${pendingLogs.length} fichadas pendientes que tienen foto?`, {
      title: 'Reprocesar Pendientes',
      confirmText: 'Reprocesar',
    });
    if (!ok) return;

    setIsReprocessing(true);
    let successCount = 0;
    try {
      for (const log of pendingLogs) {
        try {
          const userObj = allUsers.find((u) => u.id === log.userId);
          const userDressCode = userObj?.dressCode || 'N/A';
          const userRef = userObj?.photoRef || null;

          let validationResult;
          if (userObj?.role === 'Invitado') {
            validationResult = { aiAvailable: true, dressCodeMatches: true, identityMatch: true, description: 'Invitado - Sin validación IA' };
          } else {
            validationResult = await analyzeCheckIn(log.photoEvidence, userDressCode, userRef || null);
          }

          const dressCodeStatus: 'PASS' | 'FAIL' | 'SKIPPED' = validationResult.aiAvailable
            ? validationResult.dressCodeMatches
              ? 'PASS'
              : 'FAIL'
            : 'SKIPPED';

          await updateLog({
            ...log,
            dressCodeStatus,
            identityStatus: 'SKIPPED',
            aiFeedback: validationResult.description,
          });
          successCount++;
        } catch (e) {
          console.error('Error reprocesando log:', log.id, e);
        }
      }
      toast(`Se reprocesaron ${successCount} de ${pendingLogs.length} fichadas pendientes.`, 'success');
      loadData(true);
    } catch (err: any) {
      toast('Error durante el reprocesamiento: ' + (err.message || err), 'error');
    } finally {
      setIsReprocessing(false);
    }
  };

  return (
    <div className="max-w-full mx-auto p-4 md:p-8 space-y-6 md:space-y-8 animate-in fade-in duration-500">
      {/* Modales */}
      <ManualLogModal
        isOpen={showManualLogModal}
        onClose={() => setShowManualLogModal(false)}
        allUsers={allUsers}
        locations={locations}
        onSuccess={() => loadData(true)}
      />

      <EditLogModal
        isOpen={showEditLogModal}
        log={editingLog}
        locations={locations}
        onClose={() => {
          setShowEditLogModal(false);
          setEditingLog(null);
        }}
        onSuccess={(updated) => {
          setDisplayLogs((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
          loadData(true);
        }}
      />

      <IncidentsModal
        isOpen={showAlerts}
        onClose={() => setShowAlerts(false)}
        incidentLogs={incidentLogs}
        filterStartDate={filterStartDate}
        filterEndDate={filterEndDate}
        setFilterStartDate={setFilterStartDate}
        setFilterEndDate={setFilterEndDate}
        activeQuickFilter={activeQuickFilter}
        onApplyQuickFilter={applyQuickFilter}
        onApplyFilter={handleApplyFilter}
        onClearFilter={handleClearFilter}
        onZoomImage={setZoomedImage}
        onDeleteLog={handleDeleteLog}
      />

      <NoExitsModal
        isOpen={showNoExitsModal}
        onClose={() => setShowNoExitsModal(false)}
        noExitLogs={noExitLogs}
        onZoomImage={setZoomedImage}
      />

      <ZoomedImageModal imageUrl={zoomedImage} onClose={() => setZoomedImage(null)} />

      {/* Monitor Principal */}
      <div className="bg-white rounded-[24px] md:rounded-[32px] p-5 md:p-10 border border-slate-200 shadow-sm overflow-hidden">
        {/* Indicador de Fichadas Pendientes */}
        {pendingSyncCount > 0 && (
          <div className="mb-6 px-6 py-4 bg-amber-50 border-2 border-amber-200 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-amber-800">
            <div className="flex items-center gap-3">
              <RefreshCw size={20} className="animate-spin text-amber-600 shrink-0" />
              <div>
                <p className="text-xs font-black uppercase tracking-wider">
                  {pendingSyncCount} {pendingSyncCount === 1 ? 'fichada pendiente' : 'fichadas pendientes'} de sincronizar
                </p>
                <p className="text-[10px] text-amber-700 font-medium">Hay registros locales pendientes de subir a la base de datos.</p>
              </div>
            </div>
            <button
              onClick={() => syncPendingLogs(() => loadData(true))}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm shrink-0"
            >
              Sincronizar ahora
            </button>
          </div>
        )}

        <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-6">
          <div className="text-center md:text-left">
            <h3 className="text-xl md:text-2xl font-black text-slate-900 tracking-tighter uppercase flex items-center justify-center md:justify-start gap-3">
              <Monitor className="text-orange-600" /> MONITOR DE PERSONAL
            </h3>
            <p className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest">En vivo - UpFest Control</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:gap-3 w-full md:w-auto justify-center">
            <button
              onClick={() => loadData(true)}
              className={`flex-1 md:flex-none px-4 md:px-6 py-3 md:py-4 rounded-full border flex items-center justify-center gap-3 transition-all bg-white border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm ${
                isFiltering ? 'opacity-50' : ''
              }`}
              title="Refrescar datos"
            >
              <RefreshCw size={18} className={isFiltering ? 'animate-spin' : ''} />
              <span className="text-[10px] font-black uppercase">Refrescar</span>
            </button>
            <button
              onClick={handleReprocessPending}
              disabled={isReprocessing}
              className="flex-1 md:flex-none px-4 md:px-6 py-3 md:py-4 rounded-full bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center gap-3 transition-all hover:bg-amber-100 shadow-sm disabled:opacity-50"
              title="Reprocesar con IA las fichadas pendientes con foto"
            >
              <Sparkles size={18} className={isReprocessing ? 'animate-spin' : ''} />
              <span className="text-[10px] font-black uppercase">{isReprocessing ? 'Reprocesando...' : 'Reprocesar Pendientes'}</span>
            </button>
            <button
              onClick={() => setShowManualLogModal(true)}
              className="flex-1 md:flex-none px-4 md:px-6 py-3 md:py-4 rounded-full bg-slate-900 text-white flex items-center justify-center gap-3 transition-all hover:bg-slate-800 shadow-sm"
            >
              <CalendarPlus size={18} />
              <span className="text-[10px] font-black uppercase">Fichada Manual</span>
            </button>
            <button
              onClick={handleExportExcel}
              className="flex-1 md:flex-none px-4 md:px-6 py-3 md:py-4 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center gap-3 transition-all hover:bg-emerald-100 shadow-sm"
            >
              <Download size={18} />
              <span className="text-[10px] font-black uppercase">Exportar Reporte</span>
            </button>
            <button
              onClick={() => setShowAlerts(true)}
              className={`flex-1 md:flex-none px-4 md:px-6 py-3 md:py-4 rounded-full border flex items-center justify-center gap-3 transition-all ${
                incidentLogs.length > 0 ? 'bg-red-50 border-red-200 text-red-600 shadow-lg shadow-red-100' : 'bg-slate-50 text-slate-400'
              }`}
            >
              <Bell size={18} className={incidentLogs.length > 0 ? 'animate-bounce' : ''} />
              <span className="text-[10px] font-black uppercase">Alertas ({incidentLogs.length})</span>
            </button>
            <button
              onClick={() => setShowNoExitsModal(true)}
              className={`flex-1 md:flex-none px-4 md:px-6 py-3 md:py-4 rounded-full border flex items-center justify-center gap-3 transition-all ${
                noExitLogs.length > 0 ? 'bg-orange-50 border-orange-200 text-orange-600 shadow-lg shadow-orange-100' : 'bg-slate-50 text-slate-400'
              }`}
            >
              <TimerOff size={18} />
              <span className="text-[10px] font-black uppercase">Sin Egreso ({noExitLogs.length})</span>
            </button>
          </div>
        </div>

        {fetchError && (
          <div className="mb-8 p-6 bg-rose-50 border border-rose-200 rounded-[28px] flex items-center gap-4 animate-in slide-in-from-top-4">
            <AlertTriangle className="text-rose-600 shrink-0" size={24} />
            <div className="flex-1">
              <p className="text-xs font-black text-rose-900 uppercase tracking-wider">
                {fetchError.includes('timeout') || fetchError.includes('statement timeout')
                  ? 'La base de datos está tardando en responder'
                  : 'Hubo un problema al cargar los datos'}
              </p>
              <p className="text-[10px] text-rose-600 mt-1">
                {fetchError.includes('timeout') || fetchError.includes('statement timeout')
                  ? 'Estamos intentando recuperar la información. Por favor, intenta refrescar en unos segundos.'
                  : 'Si el problema persiste, contacta al soporte técnico.'}
              </p>
            </div>
            <button
              onClick={() => loadData(true)}
              className="px-4 py-2 bg-rose-600 text-white text-[10px] font-black uppercase rounded-xl hover:bg-rose-700 transition-all"
            >
              Reintentar
            </button>
          </div>
        )}

        <div className="mb-8 p-6 md:p-8 bg-slate-50/80 rounded-[28px] md:rounded-[40px] border border-slate-100 space-y-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-2 flex items-center gap-2">
              <Filter size={14} /> Filtros Rápidos:
            </span>
            {[
              { id: 'today', label: 'Hoy', icon: Clock },
              { id: 'yesterday', label: 'Ayer', icon: RotateCcw },
              { id: 'week', label: '7 Días', icon: Calendar },
              { id: 'month', label: 'Este Mes', icon: Briefcase },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => applyQuickFilter(f.id as any)}
                className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all border-2 ${
                  activeQuickFilter === f.id
                    ? 'bg-orange-600 border-orange-600 text-white shadow-xl shadow-orange-200'
                    : 'bg-white border-slate-100 text-slate-500 hover:border-orange-400'
                }`}
              >
                <f.icon size={14} /> {f.label}
              </button>
            ))}
            {(filterStartDate || filterEndDate || personSearchTerm) && (
              <button
                onClick={handleClearFilter}
                className="px-5 py-2.5 bg-rose-50 text-rose-600 border-2 border-rose-100 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-rose-100 transition-colors"
              >
                <XOctagon size={14} /> Limpiar
              </button>
            )}
          </div>
          <div className="space-y-4 border-t border-slate-200 pt-8">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Search size={14} /> Buscar Colaborador (Nombre o DNI):
            </span>
            <div className="relative max-w-md">
              <input
                type="text"
                placeholder="Ej: Juan Perez o 12345678..."
                value={personSearchTerm}
                onChange={(e) => setPersonSearchTerm(e.target.value)}
                className="w-full bg-white border-2 border-slate-100 p-4 pl-12 rounded-2xl font-bold text-xs outline-none focus:border-orange-500 shadow-sm"
              />
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-11 items-end gap-4 border-t border-slate-200 pt-8">
            <div className="md:col-span-4 space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Calendar size={14} /> Fecha Inicio
              </label>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="w-full bg-white border-2 border-slate-100 p-4 rounded-2xl font-bold text-xs outline-none focus:border-orange-500 shadow-sm"
              />
            </div>
            <div className="md:col-span-4 space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Calendar size={14} /> Fecha Fin
              </label>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="w-full bg-white border-2 border-slate-100 p-4 rounded-2xl font-bold text-xs outline-none focus:border-orange-500 shadow-sm"
              />
            </div>
            <div className="md:col-span-3 flex gap-2">
              <button
                onClick={handleApplyFilter}
                disabled={isFiltering}
                className="flex-1 bg-slate-900 text-white px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-slate-800 disabled:opacity-50 shadow-xl transition-all"
              >
                {isFiltering ? <RefreshCw className="animate-spin" size={16} /> : <Search size={16} />} Filtrar Rango
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto bg-slate-50/50 rounded-[20px] md:rounded-[32px] border border-slate-100 relative">
          {isFiltering && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                <RefreshCw className="text-orange-600 animate-spin" size={40} />
                <span className="text-xs font-black text-slate-900 uppercase tracking-widest">Cargando registros...</span>
              </div>
            </div>
          )}
          <table className="w-full text-left min-w-[1100px] border-collapse">
            <thead>
              <tr className="bg-[#0f172a] text-white">
                <th className="p-6 text-[10px] font-black uppercase text-center w-24">Foto</th>
                <th className="p-6 text-[10px] font-black uppercase">Colaborador</th>
                <th className="p-6 text-[10px] font-black uppercase text-center">Fecha / Hora</th>
                <th className="p-6 text-[10px] font-black uppercase text-center">Tipo</th>
                <th className="p-6 text-[10px] font-black uppercase text-center">Duración</th>
                <th className="p-6 text-[10px] font-black uppercase text-center border-l border-white/10">Vestimenta</th>
                <th className="p-6 text-[10px] font-black uppercase">Descripción IA</th>
                <th className="p-6 text-[10px] font-black uppercase text-center w-20">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(() => {
                const filteredLogs = displayLogs.filter((log) => {
                  if (!personSearchTerm) return true;
                  const term = personSearchTerm.toLowerCase();
                  return log.userName.toLowerCase().includes(term) || log.legajo.toLowerCase().includes(term);
                });

                if (filteredLogs.length === 0) {
                  return (
                    <tr>
                      <td colSpan={8} className="p-32 text-center text-slate-300 font-black uppercase tracking-[0.2em] italic">
                        Sin registros
                      </td>
                    </tr>
                  );
                }

                const totalPages = Math.ceil(filteredLogs.length / pageSize);
                const startIndex = (currentPage - 1) * pageSize;
                const paginatedLogs = filteredLogs.slice(startIndex, startIndex + pageSize);

                return paginatedLogs.map((log) => {
                  const durationMins = getShiftDuration(log, displayLogs);
                  const isNoExitCase = noExitLogs.some((n) => n.id === log.id);
                  return (
                    <tr key={log.id} className={`hover:bg-white transition-all ${isNoExitCase ? 'bg-orange-50/20' : ''}`}>
                      <td className="p-6 text-center">
                        <div
                          onClick={() => log.photoEvidence && setZoomedImage(log.photoEvidence)}
                          className="w-14 h-14 mx-auto rounded-xl overflow-hidden border-2 border-white cursor-zoom-in shadow-md"
                        >
                          {log.photoEvidence ? (
                            <img
                              src={log.photoEvidence}
                              alt={log.userName}
                              loading="lazy"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.nextElementSibling?.classList.remove('hidden');
                              }}
                            />
                          ) : null}
                          <div className={`bg-slate-100 w-full h-full flex items-center justify-center ${log.photoEvidence ? 'hidden' : ''}`}>
                            {log.aiFeedback.includes('manual') ? (
                              <FileText className="text-slate-300" />
                            ) : (
                              <UserIcon className="text-slate-300" />
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-6">
                        <span className="block font-black text-slate-900 text-xs md:text-sm uppercase tracking-tight">{log.userName}</span>
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                          Lgj: {log.legajo} | {log.locationName}
                        </span>
                      </td>
                      <td className="p-6 text-center">
                        <span className="text-[10px] md:text-xs font-black text-slate-900 font-mono uppercase bg-slate-100 px-3 py-1 rounded-lg">
                          {new Date(log.timestamp).toLocaleTimeString('es-AR', {
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'America/Argentina/Buenos_Aires',
                          })}
                        </span>
                        <span className="block text-[9px] text-slate-400 uppercase font-black mt-1.5">
                          {new Date(log.timestamp).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}
                        </span>
                      </td>
                      <td className="p-6 text-center">
                        <span
                          className={`px-5 py-2 rounded-full text-[9px] font-black uppercase border-2 ${
                            log.type === 'CHECK_IN'
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {log.type === 'CHECK_IN' ? 'INGRESO' : 'EGRESO'}
                        </span>
                      </td>
                      <td className="p-6 text-center">
                        {durationMins !== null ? (
                          <div className="flex flex-col items-center">
                            <span className="text-[10px] font-black bg-orange-100 text-orange-700 px-2 py-1 rounded-lg">
                              {formatMinutes(durationMins)}
                            </span>
                            <span className="text-[8px] font-black text-slate-400 uppercase mt-1">({durationMins} min)</span>
                          </div>
                        ) : (
                          <span className="text-slate-200">
                            {isNoExitCase ? <span className="text-[9px] font-black text-orange-500 uppercase">Sin Egreso</span> : '---'}
                          </span>
                        )}
                      </td>
                      <td className="p-6 text-center border-l border-slate-100">
                        <span
                          className={`text-[9px] font-black uppercase px-3 py-1 rounded-lg ${
                            log.dressCodeStatus === 'PENDING'
                              ? 'bg-amber-100 text-amber-700'
                              : log.dressCodeStatus === 'PASS'
                              ? 'bg-emerald-100 text-emerald-700'
                              : log.dressCodeStatus === 'SKIPPED'
                              ? 'bg-slate-100 text-slate-500'
                              : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {log.dressCodeStatus === 'PENDING'
                            ? 'Analizando...'
                            : log.dressCodeStatus === 'PASS'
                            ? 'Correcto'
                            : log.dressCodeStatus === 'SKIPPED'
                            ? 'Omitido'
                            : 'Error'}
                        </span>
                      </td>
                      <td className="p-6 max-w-xs">
                        <p className="text-[10px] italic text-slate-500 leading-relaxed line-clamp-2" title={log.aiFeedback}>
                          "{log.aiFeedback}"
                        </p>
                      </td>
                      <td className="p-6 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleRevalidateLog(log)}
                            disabled={isRevalidating === log.id || !log.photoEvidence || log.photoEvidence === 'manual'}
                            className="p-3 text-slate-400 hover:text-emerald-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Revalidar con IA"
                          >
                            <RefreshCw size={20} className={isRevalidating === log.id ? 'animate-spin' : ''} />
                          </button>
                          <button
                            onClick={() => {
                              setEditingLog(log);
                              setShowEditLogModal(true);
                            }}
                            className="p-3 text-slate-400 hover:text-blue-500 transition-all"
                            title="Editar fichada"
                          >
                            <Pencil size={20} />
                          </button>
                          <button
                            disabled={isDeleting === log.id}
                            onClick={() => handleDeleteLog(log.id)}
                            className="p-3 text-slate-200 hover:text-red-500 transition-all"
                            title="Eliminar fichada"
                          >
                            {isDeleting === log.id ? <RefreshCw className="animate-spin" size={16} /> : <Trash2 size={20} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {(() => {
          const filteredLogs = displayLogs.filter((log) => {
            if (!personSearchTerm) return true;
            const term = personSearchTerm.toLowerCase();
            return log.userName.toLowerCase().includes(term) || log.legajo.toLowerCase().includes(term);
          });
          const totalPages = Math.ceil(filteredLogs.length / pageSize);
          if (totalPages <= 1) return null;

          return (
            <div className="p-6 border-t flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-50/50">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                Página {currentPage} de {totalPages} ({filteredLogs.length} registros)
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-4 py-2 border rounded-xl text-xs font-bold bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-all"
                >
                  Anterior
                </button>
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageNum = i + 1;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-8 h-8 rounded-lg text-xs font-black transition-all ${
                          currentPage === pageNum ? 'bg-slate-900 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-4 py-2 border rounded-xl text-xs font-bold bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-all"
                >
                  Siguiente
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};
