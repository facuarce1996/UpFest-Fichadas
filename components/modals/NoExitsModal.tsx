import React from 'react';
import { X, TimerOff, Clock, CheckCircle, User as UserIcon, Building } from 'lucide-react';
import { LogEntry } from '../../types';

interface NoExitsModalProps {
  isOpen: boolean;
  onClose: () => void;
  noExitLogs: LogEntry[];
  onZoomImage: (url: string) => void;
}

export const NoExitsModal: React.FC<NoExitsModalProps> = ({
  isOpen,
  onClose,
  noExitLogs,
  onZoomImage,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/95 backdrop-blur-xl flex items-center justify-center p-2 md:p-6">
      <div className="bg-white w-full max-w-5xl max-h-[95vh] rounded-[40px] md:rounded-[64px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 border-4 border-slate-100">
        <div className="p-8 md:p-12 border-b flex items-center justify-between gap-6 bg-white relative">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-orange-50 rounded-[24px] flex items-center justify-center text-orange-600 shadow-inner">
              <TimerOff size={32} />
            </div>
            <div>
              <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tighter text-slate-900 leading-none">
                INGRESOS SIN EGRESO
              </h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 italic flex items-center gap-2">
                <Clock size={12} /> Regla de las 20 horas - UpFest Control
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 hover:bg-orange-600 hover:text-white transition-all shadow-sm"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-12 space-y-6 bg-slate-50/30">
          {noExitLogs.length === 0 ? (
            <div className="py-32 text-center flex flex-col items-center gap-8 animate-in fade-in zoom-in-95">
              <div className="w-32 h-32 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 shadow-inner">
                <CheckCircle size={64} />
              </div>
              <p className="text-xl font-black text-slate-800 uppercase tracking-tighter">NÓMINA AL DÍA</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {noExitLogs.map((log) => (
                <div
                  key={log.id}
                  className="bg-white border-2 border-slate-100 rounded-[40px] p-6 md:p-10 flex flex-col md:flex-row gap-10 items-start md:items-center shadow-sm hover:shadow-2xl hover:border-orange-100 transition-all group animate-in slide-in-from-bottom-4"
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
                        In: {new Date(log.timestamp).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 px-5 py-2.5 bg-orange-600 text-white rounded-2xl shadow-lg w-fit">
                      <TimerOff size={16} />
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
