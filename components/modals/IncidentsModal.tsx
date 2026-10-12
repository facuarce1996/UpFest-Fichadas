import React from 'react';
import { 
  X, Bell, Shield, Clock, RotateCcw, Calendar, Briefcase, Filter, Search, 
  CheckCircle, User as UserIcon, Building, Shirt, Eye, Trash2, Maximize2 
} from 'lucide-react';
import { LogEntry } from '../../types';

interface IncidentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  incidentLogs: LogEntry[];
  filterStartDate: string;
  filterEndDate: string;
  setFilterStartDate: (date: string) => void;
  setFilterEndDate: (date: string) => void;
  activeQuickFilter: string | null;
  onApplyQuickFilter: (type: 'today' | 'yesterday' | 'week' | 'month') => void;
  onApplyFilter: () => void;
  onClearFilter: () => void;
  onZoomImage: (url: string) => void;
  onDeleteLog: (id: string) => void;
}

export const IncidentsModal: React.FC<IncidentsModalProps> = ({
  isOpen,
  onClose,
  incidentLogs,
  filterStartDate,
  filterEndDate,
  setFilterStartDate,
  setFilterEndDate,
  activeQuickFilter,
  onApplyQuickFilter,
  onApplyFilter,
  onClearFilter,
  onZoomImage,
  onDeleteLog,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/95 backdrop-blur-xl flex items-center justify-center p-2 md:p-6">
      <div className="bg-white w-full max-w-5xl max-h-[95vh] rounded-[40px] md:rounded-[64px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 border-4 border-slate-100">
        <div className="p-8 md:p-12 border-b flex items-center justify-between gap-6 bg-white relative">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-rose-50 rounded-[24px] flex items-center justify-center text-rose-600 shadow-inner">
              <Bell size={32} />
            </div>
            <div>
              <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tighter text-slate-900 leading-none">
                CENTRO DE INCIDENCIAS
              </h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 italic flex items-center gap-2">
                <Shield size={12} /> Seguridad en Tiempo Real - UpFest Control
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 hover:bg-rose-600 hover:text-white transition-all shadow-sm"
          >
            <X size={24} />
          </button>
        </div>

        <div className="px-8 py-6 md:px-12 bg-slate-50 border-b space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mr-2 flex items-center gap-1">
              <Filter size={12} /> Periodo Alertas:
            </span>
            {[
              { id: 'today', label: 'Hoy', icon: Clock },
              { id: 'yesterday', label: 'Ayer', icon: RotateCcw },
              { id: 'week', label: 'Semana', icon: Calendar },
              { id: 'month', label: 'Mes', icon: Briefcase },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => onApplyQuickFilter(f.id as any)}
                className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2 transition-all border-2 ${
                  activeQuickFilter === f.id
                    ? 'bg-rose-600 border-rose-600 text-white shadow-lg'
                    : 'bg-white border-slate-100 text-slate-500 hover:border-rose-400'
                }`}
              >
                <f.icon size={12} /> {f.label}
              </button>
            ))}
            {(filterStartDate || filterEndDate) && (
              <button
                onClick={onClearFilter}
                className="px-4 py-2 bg-rose-50 text-rose-600 border-2 border-rose-100 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2"
              >
                <X size={12} /> Limpiar Rango
              </button>
            )}
          </div>
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[8px] font-black uppercase text-slate-400">Desde</label>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className="w-full bg-white border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none focus:border-rose-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[8px] font-black uppercase text-slate-400">Hasta</label>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  className="w-full bg-white border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none focus:border-rose-500"
                />
              </div>
            </div>
            <button
              onClick={onApplyFilter}
              className="bg-slate-900 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-slate-800 transition-all shadow-lg"
            >
              <Search size={14} /> Buscar en Historial
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-12 space-y-6 bg-slate-50/30">
          {incidentLogs.length === 0 ? (
            <div className="py-32 text-center flex flex-col items-center gap-8 animate-in fade-in zoom-in-95">
              <div className="w-32 h-32 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 shadow-inner">
                <CheckCircle size={64} />
              </div>
              <div className="space-y-2">
                <p className="text-xl font-black text-slate-800 uppercase tracking-tighter">SIN INCIDENCIAS EN EL PERIODO</p>
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Todo bajo control - UpFest Security</p>
              </div>
            </div>
          ) : (
            incidentLogs.map((log) => (
              <div
                key={log.id}
                className="bg-white border-2 border-slate-100 rounded-[40px] p-6 md:p-10 flex flex-col md:flex-row gap-10 items-start md:items-center shadow-sm hover:shadow-2xl hover:border-rose-100 transition-all group animate-in slide-in-from-bottom-4"
              >
                <div
                  onClick={() => log.photoEvidence && onZoomImage(log.photoEvidence)}
                  className="w-40 h-40 md:w-56 md:h-56 shrink-0 bg-slate-900 rounded-[32px] overflow-hidden border-8 border-slate-50 cursor-zoom-in relative group/img shadow-2xl"
                >
                  {log.photoEvidence ? (
                    <img
                      src={log.photoEvidence}
                      alt={log.userName}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover/img:scale-110 transition-transform duration-700"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-500">
                      <UserIcon size={48} />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-rose-600/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center text-white transition-opacity backdrop-blur-sm">
                    <Maximize2 size={32} />
                  </div>
                </div>
                <div className="flex-1 space-y-6">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-4">
                      <span className="font-black text-3xl text-slate-900 uppercase tracking-tighter leading-none">
                        {log.userName}
                      </span>
                      <span className="px-4 py-1.5 bg-slate-100 text-slate-500 text-[10px] font-black uppercase rounded-lg border border-slate-200">
                        Lgj: {log.legajo}
                      </span>
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Building size={14} /> Sede: {log.locationName} <span className="text-slate-200">|</span> <Clock size={14} />{' '}
                      {new Date(log.timestamp).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {log.dressCodeStatus === 'FAIL' && (
                      <div className="flex items-center gap-3 px-5 py-2.5 bg-orange-500 text-white rounded-2xl shadow-lg shadow-orange-100">
                        <Shirt size={16} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Fallo de Vestimenta</span>
                      </div>
                    )}
                  </div>
                  <div className="bg-slate-50 p-6 rounded-[28px] border-2 border-slate-100 relative">
                    <p className="text-[11px] italic text-slate-600 leading-relaxed font-medium" title={log.aiFeedback}>
                      "{log.aiFeedback}"
                    </p>
                    <div className="absolute -top-3 left-6 px-3 bg-white text-[8px] font-black uppercase text-slate-300 tracking-widest border border-slate-100 rounded-md">
                      ANÁLISIS IA
                    </div>
                  </div>
                </div>
                <div className="w-full md:w-auto flex md:flex-col gap-2">
                  <button
                    onClick={() => log.photoEvidence && onZoomImage(log.photoEvidence)}
                    className="flex-1 p-5 bg-slate-50 text-slate-400 rounded-3xl hover:bg-slate-900 hover:text-white transition-all shadow-sm"
                    title="Ver foto completa"
                  >
                    <Eye size={24} className="mx-auto" />
                  </button>
                  <button
                    onClick={() => onDeleteLog(log.id)}
                    className="flex-1 p-5 bg-rose-50 text-rose-400 rounded-3xl hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                    title="Borrar registro"
                  >
                    <Trash2 size={24} className="mx-auto" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-10 md:p-14 border-t bg-white flex justify-center">
          <button
            onClick={onClose}
            className="w-full md:w-80 py-6 bg-slate-900 text-white rounded-[28px] font-black uppercase tracking-[0.2em] shadow-2xl hover:scale-[1.05] transition-all text-xs"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
