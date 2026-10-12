import React, { useState, useEffect } from 'react';
import { X, Save, RefreshCw } from 'lucide-react';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { Location, LogEntry } from '../../types';
import { updateLog } from '../../services/utils';
import { useFeedback } from '../../services/feedbackContext';

interface EditLogModalProps {
  isOpen: boolean;
  log: LogEntry | null;
  locations: Location[];
  onClose: () => void;
  onSuccess: (updatedLog: LogEntry) => void;
}

const TIME_ZONE = 'America/Argentina/Buenos_Aires';

export const EditLogModal: React.FC<EditLogModalProps> = ({
  isOpen,
  log,
  locations,
  onClose,
  onSuccess,
}) => {
  const { toast } = useFeedback();
  const [editingLog, setEditingLog] = useState<LogEntry | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [originalTimestamp, setOriginalTimestamp] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (log) {
      setEditingLog(log);
      setOriginalTimestamp(log.timestamp);
      setEditDate(formatInTimeZone(log.timestamp, TIME_ZONE, 'yyyy-MM-dd'));
      setEditTime(formatInTimeZone(log.timestamp, TIME_ZONE, 'HH:mm'));
    } else {
      setEditingLog(null);
    }
  }, [log]);

  if (!isOpen || !editingLog) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLog) return;

    setIsSaving(true);
    try {
      const origDateStr = formatInTimeZone(originalTimestamp, TIME_ZONE, 'yyyy-MM-dd');
      const origTimeStr = formatInTimeZone(originalTimestamp, TIME_ZONE, 'HH:mm');

      // Si el usuario no toca fecha/hora, el timestamp guardado debe ser idéntico al original
      let finalTimestamp = originalTimestamp;
      if (editDate !== origDateStr || editTime !== origTimeStr) {
        finalTimestamp = fromZonedTime(`${editDate}T${editTime}:00`, TIME_ZONE).toISOString();
      }

      const selectedLocation = locations.find((loc) => loc.id === editingLog.locationId);

      const finalUpdatedLog: LogEntry = {
        ...editingLog,
        timestamp: finalTimestamp,
        locationName: selectedLocation ? selectedLocation.name : editingLog.locationName,
      };

      await updateLog(finalUpdatedLog);
      toast('Fichada actualizada con éxito.', 'success');
      onSuccess(finalUpdatedLog);
      onClose();
    } catch (error: any) {
      toast('Error al actualizar fichada: ' + (error.message || error), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-xl rounded-[40px] shadow-2xl overflow-visible animate-in zoom-in-95 duration-300">
        <div className="p-8 border-b flex items-center justify-between">
          <h3 className="text-2xl font-black uppercase tracking-tighter">Editar Fichada</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-900 transition-colors">
            <X />
          </button>
        </div>
        <form onSubmit={handleSave} className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400">Colaborador</label>
            <input
              type="text"
              value={editingLog.userName}
              disabled
              className="w-full pl-6 pr-6 py-4 bg-slate-50 rounded-2xl border-none font-bold text-sm outline-none text-slate-700"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400">Tipo de Fichada</label>
            <select
              value={editingLog.type}
              onChange={(e) => setEditingLog({ ...editingLog, type: e.target.value as 'CHECK_IN' | 'CHECK_OUT' })}
              className="w-full pl-6 pr-6 py-4 bg-slate-50 rounded-2xl border-none font-bold text-sm outline-none"
            >
              <option value="CHECK_IN">INGRESO</option>
              <option value="CHECK_OUT">EGRESO</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400">Fecha</label>
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold text-sm outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400">Sede</label>
              <select
                value={editingLog.locationId}
                onChange={(e) => setEditingLog({ ...editingLog, locationId: e.target.value })}
                className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold text-sm outline-none"
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400">Hora</label>
            <input
              type="time"
              value={editTime}
              onChange={(e) => setEditTime(e.target.value)}
              className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold text-xs outline-none"
            />
          </div>
          <div className="pt-4 flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors"
            >
              {isSaving ? <RefreshCw className="animate-spin" size={14} /> : <Save size={14} />} Guardar Cambios
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
