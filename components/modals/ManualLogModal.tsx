import React, { useState } from 'react';
import { X, Search, ChevronDown, Check, Save, RefreshCw } from 'lucide-react';
import { fromZonedTime } from 'date-fns-tz';
import { User, Location, LogEntry } from '../../types';
import { addLog } from '../../services/utils';
import { useFeedback } from '../../services/feedbackContext';

interface ManualLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  allUsers: User[];
  locations: Location[];
  onSuccess: () => void;
}

export const ManualLogModal: React.FC<ManualLogModalProps> = ({
  isOpen,
  onClose,
  allUsers,
  locations,
  onSuccess,
}) => {
  const { toast } = useFeedback();
  const [manualUserSearch, setManualUserSearch] = useState('');
  const [isUserListOpen, setIsUserListOpen] = useState(false);
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [manualLogData, setManualLogData] = useState({
    userId: '',
    type: 'BOTH' as 'CHECK_IN' | 'CHECK_OUT' | 'BOTH',
    date: new Date().toISOString().split('T')[0],
    checkInTime: '09:00',
    checkOutTime: '18:00',
    locationId: '',
  });

  if (!isOpen) return null;

  const filteredManualUsers = allUsers.filter((u) => {
    const search = (manualUserSearch || '').toLowerCase();
    const nameMatch = u.name ? u.name.toLowerCase().includes(search) : false;
    const dniMatch = u.dni ? u.dni.toLowerCase().includes(search) : false;
    const legajoMatch = u.legajo ? u.legajo.toLowerCase().includes(search) : false;
    return nameMatch || dniMatch || legajoMatch;
  });

  const handleClose = () => {
    setManualUserSearch('');
    setIsUserListOpen(false);
    onClose();
  };

  const handleSaveManualLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualLogData.userId || !manualLogData.locationId) {
      toast('Selecciona colaborador y sede.', 'warning');
      return;
    }
    if ((manualLogData.type === 'CHECK_IN' || manualLogData.type === 'BOTH') && !manualLogData.checkInTime) {
      toast('Ingresa la hora de ingreso.', 'warning');
      return;
    }
    if ((manualLogData.type === 'CHECK_OUT' || manualLogData.type === 'BOTH') && !manualLogData.checkOutTime) {
      toast('Ingresa la hora de egreso.', 'warning');
      return;
    }

    setIsSavingManual(true);
    try {
      const targetUser = allUsers.find((u) => u.id === manualLogData.userId);
      const targetLoc = locations.find((l) => l.id === manualLogData.locationId);
      if (!targetUser || !targetLoc) throw new Error('Datos de usuario o sede inválidos');

      const checkInTS = fromZonedTime(`${manualLogData.date}T${manualLogData.checkInTime}:00`, 'America/Argentina/Buenos_Aires').toISOString();
      const checkOutTS = fromZonedTime(`${manualLogData.date}T${manualLogData.checkOutTime}:00`, 'America/Argentina/Buenos_Aires').toISOString();

      if (manualLogData.type === 'CHECK_IN' || manualLogData.type === 'BOTH') {
        const inLog: LogEntry = {
          id: '',
          userId: targetUser.id,
          userName: targetUser.name,
          legajo: targetUser.legajo,
          timestamp: checkInTS,
          type: 'CHECK_IN',
          locationId: targetLoc.id,
          locationName: targetLoc.name,
          locationStatus: 'SKIPPED',
          dressCodeStatus: 'SKIPPED',
          identityStatus: 'SKIPPED',
          photoEvidence: '',
          aiFeedback: 'Carga manual por administrador',
        };
        await addLog(inLog);
      }

      if (manualLogData.type === 'CHECK_OUT' || manualLogData.type === 'BOTH') {
        const outLog: LogEntry = {
          id: '',
          userId: targetUser.id,
          userName: targetUser.name,
          legajo: targetUser.legajo,
          timestamp: checkOutTS,
          type: 'CHECK_OUT',
          locationId: targetLoc.id,
          locationName: targetLoc.name,
          locationStatus: 'SKIPPED',
          dressCodeStatus: 'SKIPPED',
          identityStatus: 'SKIPPED',
          photoEvidence: '',
          aiFeedback: 'Carga manual por administrador',
        };
        await addLog(outLog);
      }

      toast('Fichada manual cargada con éxito.', 'success');
      handleClose();
      onSuccess();
    } catch (err: any) {
      toast('Error: ' + err.message, 'error');
    } finally {
      setIsSavingManual(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-xl rounded-[40px] shadow-2xl overflow-visible animate-in zoom-in-95 duration-300">
        <div className="p-8 border-b flex items-center justify-between">
          <h3 className="text-2xl font-black uppercase tracking-tighter">Carga Manual de Fichada</h3>
          <button onClick={handleClose} className="p-2 text-slate-400 hover:text-slate-900 transition-colors">
            <X />
          </button>
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
                onChange={(e) => {
                  setManualUserSearch(e.target.value);
                  setIsUserListOpen(true);
                }}
                className="w-full pl-12 pr-12 py-4 bg-slate-50 rounded-2xl border-none font-bold text-sm outline-none focus:ring-2 focus:ring-orange-500/20"
              />
              <button
                type="button"
                onClick={() => setIsUserListOpen(!isUserListOpen)}
                className="absolute inset-y-0 right-4 flex items-center text-slate-400"
              >
                <ChevronDown size={18} className={`transition-transform ${isUserListOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {isUserListOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 max-h-60 overflow-y-auto z-[310] py-2 animate-in fade-in slide-in-from-top-2">
                {filteredManualUsers.length === 0 ? (
                  <div className="px-6 py-4 text-slate-400 text-xs font-bold uppercase italic">Sin coincidencias</div>
                ) : (
                  filteredManualUsers.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setManualLogData({ ...manualLogData, userId: u.id });
                        setManualUserSearch((u.name || '').toUpperCase());
                        setIsUserListOpen(false);
                      }}
                      className="w-full text-left px-6 py-3 hover:bg-orange-50 transition-colors flex items-center justify-between group"
                    >
                      <div>
                        <span className="block text-xs font-black text-slate-900 uppercase group-hover:text-orange-700">
                          {u.name || 'SIN NOMBRE'}
                        </span>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                          DNI: {u.dni || 'N/A'} | Lgj: {u.legajo || 'N/A'}
                        </span>
                      </div>
                      {manualLogData.userId === u.id && <Check size={16} className="text-orange-600" />}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400">Tipo de Fichada</label>
            <select
              value={manualLogData.type}
              onChange={(e) => setManualLogData({ ...manualLogData, type: e.target.value as any })}
              className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold text-sm outline-none"
            >
              <option value="CHECK_IN">SÓLO INGRESO</option>
              <option value="CHECK_OUT">SÓLO EGRESO</option>
              <option value="BOTH">INGRESO Y EGRESO</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400">Fecha</label>
              <input
                type="date"
                value={manualLogData.date}
                onChange={(e) => setManualLogData({ ...manualLogData, date: e.target.value })}
                className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold text-sm outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400">Sede</label>
              <select
                value={manualLogData.locationId}
                onChange={(e) => setManualLogData({ ...manualLogData, locationId: e.target.value })}
                className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold text-sm outline-none"
              >
                <option value="">Seleccionar sede...</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className={`space-y-2 ${manualLogData.type === 'CHECK_OUT' ? 'opacity-30 pointer-events-none' : ''}`}>
              <label className="text-[10px] font-black uppercase text-slate-400">Hora Ingreso</label>
              <input
                type="time"
                value={manualLogData.checkInTime}
                onChange={(e) => setManualLogData({ ...manualLogData, checkInTime: e.target.value })}
                className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold text-xs outline-none"
              />
            </div>
            <div className={`space-y-2 ${manualLogData.type === 'CHECK_IN' ? 'opacity-30 pointer-events-none' : ''}`}>
              <label className="text-[10px] font-black uppercase text-slate-400">Hora Egreso</label>
              <input
                type="time"
                value={manualLogData.checkOutTime}
                onChange={(e) => setManualLogData({ ...manualLogData, checkOutTime: e.target.value })}
                className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold text-xs outline-none"
              />
            </div>
          </div>
          <div className="pt-4 flex gap-4">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSavingManual}
              className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors"
            >
              {isSavingManual ? <RefreshCw className="animate-spin" size={14} /> : <Save size={14} />} Guardar Fichada
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
