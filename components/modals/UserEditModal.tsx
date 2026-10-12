import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Check, ImageIcon, Upload, Eye, EyeOff, MapPin, Clock, Plus, ArrowRight, Trash2 
} from 'lucide-react';
import { User, Location, WorkSchedule, DEFAULT_ROLES, DAYS_OF_WEEK } from '../../types';
import { saveUser } from '../../services/utils';
import { useFeedback } from '../../services/feedbackContext';

interface UserEditModalProps {
  isOpen: boolean;
  user: User | null;
  locations: Location[];
  availableRoles: string[];
  onClose: () => void;
  onSuccess: () => void;
}

export const UserEditModal: React.FC<UserEditModalProps> = ({
  isOpen,
  user,
  locations,
  availableRoles,
  onClose,
  onSuccess,
}) => {
  const { toast } = useFeedback();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<Partial<User>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isAddingNewRole, setIsAddingNewRole] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        ...user,
        password: '',
        schedule: user.schedule || [],
        assignedLocations: user.assignedLocations || [],
        isActive: user.isActive,
      });
    } else {
      setFormData({
        role: 'Mozo',
        schedule: [],
        assignedLocations: [],
        isActive: true,
        password: '',
      });
    }
    setIsAddingNewRole(false);
  }, [user, isOpen]);

  if (!isOpen) return null;

  const isNewUser = !user;
  const isChangingToAdmin = !isNewUser && user?.role !== 'Admin' && formData.role === 'Admin';

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData((prev) => ({ ...prev, photoRef: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleLocation = (locId: string) => {
    const current = formData.assignedLocations || [];
    const next = current.includes(locId) ? current.filter((id) => id !== locId) : [...current, locId];
    setFormData({ ...formData, assignedLocations: next });
  };

  const addSchedule = () => {
    const current = formData.schedule || [];
    setFormData({
      ...formData,
      schedule: [
        ...current,
        { startDay: 'Lunes', startTime: '09:00', endDay: 'Lunes', endTime: '18:00' },
      ],
    });
  };

  const updateSchedule = (idx: number, field: keyof WorkSchedule, val: string) => {
    const current = [...(formData.schedule || [])];
    current[idx] = { ...current[idx], [field]: val };
    setFormData({ ...formData, schedule: current });
  };

  const removeSchedule = (idx: number) => {
    const current = (formData.schedule || []).filter((_, i) => i !== idx);
    setFormData({ ...formData, schedule: current });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.dni) {
      toast('Nombre y DNI obligatorios.', 'warning');
      return;
    }
    if (!formData.role || formData.role.trim() === '') {
      toast('El rol/puesto es obligatorio.', 'warning');
      return;
    }

    // En altas nuevas de rol Admin la contraseña es obligatoria
    if (isNewUser && formData.role === 'Admin' && (!formData.password || formData.password.trim() === '')) {
      toast('La contraseña es obligatoria para nuevos usuarios con rol Admin.', 'warning');
      return;
    }

    // Si se cambia el rol a Admin, exigir contraseña nueva
    if (isChangingToAdmin && (!formData.password || formData.password.trim() === '')) {
      toast('Al cambiar el rol de un colaborador a Admin, es obligatorio definir una nueva contraseña de acceso.', 'warning');
      return;
    }

    setFormSaving(true);
    try {
      await saveUser(formData as User);
      setSaveSuccess(true);
      toast('Usuario guardado exitosamente.', 'success');
      setTimeout(() => {
        setSaveSuccess(false);
        onSuccess();
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Error al guardar usuario:', err.message || err);
      toast('Error al guardar: ' + err.message, 'error');
    } finally {
      setFormSaving(false);
    }
  };

  return (
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

        <button
          type="button"
          onClick={onClose}
          className="absolute top-6 right-6 md:top-8 md:right-8 p-3 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-400 transition-colors z-10"
        >
          <X size={20} />
        </button>

        <form onSubmit={handleSubmit} className="p-6 md:p-12 space-y-8 md:space-y-12">
          <div className="border-b pb-6">
            <h2 className="font-black text-3xl md:text-4xl text-slate-900 uppercase tracking-tighter leading-none">
              {user ? 'EDITAR FICHA' : 'NUEVO COLABORADOR'}
            </h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 italic">SISTEMA RRHH - UPFEST</p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 md:gap-12">
            <div className="flex flex-col items-center gap-6">
              <div className="aspect-[4/5] w-full bg-slate-50 rounded-[32px] border-4 border-slate-100 relative overflow-hidden group shadow-inner">
                {formData.photoRef ? (
                  <img
                    src={formData.photoRef}
                    alt="Foto de referencia"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                ) : null}
                <div className={`w-full h-full flex items-center justify-center text-slate-200 ${formData.photoRef ? 'hidden' : ''}`}>
                  <ImageIcon size={48} />
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-black text-xs uppercase gap-2 backdrop-blur-sm"
                >
                  <Upload size={18} /> Cambiar Foto
                </button>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleImageChange} className="hidden" accept="image/*" />
              <div className="w-full space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">LEGAJO</label>
                <input
                  type="text"
                  value={formData.legajo || ''}
                  onChange={(e) => setFormData({ ...formData, legajo: e.target.value })}
                  className="w-full p-4 bg-slate-50 rounded-[20px] font-black text-slate-900 outline-none text-xs"
                  placeholder="ADM-000"
                />
              </div>
            </div>

            <div className="xl:col-span-2 space-y-6 md:space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="col-span-full space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Nombre Completo</label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full p-5 bg-slate-50 rounded-[20px] font-black text-slate-900 outline-none uppercase text-sm md:text-base border border-transparent focus:border-slate-200"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">DNI (Usuario)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formData.dni || ''}
                    onChange={(e) => setFormData({ ...formData, dni: e.target.value })}
                    className="w-full p-5 bg-slate-50 rounded-[20px] font-black text-slate-900 outline-none text-sm border border-transparent focus:border-slate-200"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Rol / Puesto</label>
                  {!isAddingNewRole ? (
                    <select
                      value={formData.role || 'Mozo'}
                      onChange={(e) => {
                        if (e.target.value === '___NEW___') {
                          setIsAddingNewRole(true);
                          setFormData({ ...formData, role: '' });
                        } else {
                          setFormData({ ...formData, role: e.target.value });
                        }
                      }}
                      className="w-full p-5 bg-slate-50 rounded-[20px] font-black text-slate-900 outline-none appearance-none text-sm border border-transparent focus:border-slate-200"
                    >
                      {availableRoles.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                      <option value="___NEW___">+ Agregar nuevo puesto...</option>
                    </select>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={formData.role || ''}
                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                        placeholder="Nombre del puesto"
                        className="w-full p-5 bg-slate-50 rounded-[20px] font-black text-slate-900 outline-none text-sm border border-transparent focus:border-slate-200"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!formData.role) setFormData({ ...formData, role: 'Mozo' });
                          setIsAddingNewRole(false);
                        }}
                        className="p-5 bg-slate-100 text-slate-500 rounded-[20px] hover:bg-slate-200 transition-colors"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                    Clave de Acceso {(formData.role === 'Admin' && (!user || user.role !== 'Admin')) ? '(Obligatoria para Admin)' : '(Opcional)'}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password || ''}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder={
                        user
                          ? user.role !== 'Admin' && formData.role === 'Admin'
                            ? 'Obligatoria al cambiar a rol Admin'
                            : 'Dejar vacío para no cambiar'
                          : formData.role === 'Admin'
                          ? 'Obligatoria para rol Admin'
                          : 'Opcional'
                      }
                      className="w-full p-5 bg-slate-50 rounded-[20px] font-black text-slate-900 outline-none text-sm border border-transparent focus:border-slate-200 pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>
                <div className="col-span-full space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Vestimenta Requerida</label>
                  <textarea
                    value={formData.dressCode || ''}
                    onChange={(e) => setFormData({ ...formData, dressCode: e.target.value })}
                    className="w-full p-5 bg-slate-50 rounded-[20px] font-black text-slate-900 h-24 outline-none text-sm resize-none border border-transparent focus:border-slate-200"
                    placeholder="Ej: Remera negra lisa, pantalón oscuro..."
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-black text-[12px] uppercase tracking-tighter flex items-center gap-2 text-slate-800">
                  <MapPin size={18} /> SEDES ASIGNADAS
                </h4>
                <div className="flex flex-wrap gap-3">
                  {locations.map((loc) => {
                    const isActive = formData.assignedLocations?.includes(loc.id);
                    return (
                      <button
                        key={loc.id}
                        type="button"
                        onClick={() => toggleLocation(loc.id)}
                        className={`px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all flex items-center gap-3 ${
                          isActive
                            ? 'bg-white border-orange-500 text-orange-600 shadow-lg shadow-orange-50'
                            : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'
                        }`}
                      >
                        {loc.name}
                        {isActive && <Check size={14} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-50/50 p-6 md:p-10 rounded-[32px] md:rounded-[48px] border border-slate-100 space-y-8">
            <div className="flex items-center justify-between gap-4">
              <h4 className="font-black text-[12px] uppercase tracking-tighter flex items-center gap-3 text-slate-800">
                <Clock size={20} /> HORARIOS DE TRABAJO
              </h4>
              <button
                type="button"
                onClick={addSchedule}
                className="bg-white border-2 border-slate-200 text-slate-900 px-6 py-3 rounded-2xl flex items-center gap-2 font-black text-[10px] uppercase tracking-widest shadow-sm hover:border-orange-500 hover:text-orange-600 transition-all"
              >
                <Plus size={18} /> AÑADIR FRANJA
              </button>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {!formData.schedule || formData.schedule.length === 0 ? (
                <div className="py-12 text-center border-4 border-dashed rounded-[32px] border-slate-100">
                  <Clock size={48} className="mx-auto text-slate-200 mb-4" strokeWidth={1} />
                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Sin horarios configurados</p>
                </div>
              ) : (
                formData.schedule.map((slot, idx) => (
                  <div
                    key={idx}
                    className="bg-white p-8 rounded-[28px] shadow-sm border border-slate-100 relative group animate-in slide-in-from-right-4"
                  >
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 items-center">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Inicia</label>
                        <select
                          value={slot.startDay}
                          onChange={(e) => updateSchedule(idx, 'startDay', e.target.value)}
                          className="w-full bg-slate-50 p-4 rounded-xl border-none font-bold text-xs appearance-none cursor-pointer"
                        >
                          {DAYS_OF_WEEK.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Entrada</label>
                        <div className="relative">
                          <input
                            type="time"
                            value={slot.startTime}
                            onChange={(e) => updateSchedule(idx, 'startTime', e.target.value)}
                            className="w-full bg-slate-50 p-4 rounded-xl border-none font-bold text-xs cursor-pointer"
                          />
                          <Clock className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" size={14} />
                        </div>
                      </div>
                      <div className="hidden md:flex items-center justify-center text-slate-200 pt-6">
                        <ArrowRight size={24} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Termina</label>
                        <select
                          value={slot.endDay}
                          onChange={(e) => updateSchedule(idx, 'endDay', e.target.value)}
                          className="w-full bg-slate-50 p-4 rounded-xl border-none font-bold text-xs appearance-none cursor-pointer"
                        >
                          {DAYS_OF_WEEK.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Salida</label>
                        <div className="relative">
                          <input
                            type="time"
                            value={slot.endTime}
                            onChange={(e) => updateSchedule(idx, 'endTime', e.target.value)}
                            className="w-full bg-slate-50 p-4 rounded-xl border-none font-bold text-xs cursor-pointer"
                          />
                          <Clock className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" size={14} />
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeSchedule(idx)}
                      className="absolute -bottom-3 -left-3 md:bottom-auto md:left-auto md:top-6 md:right-6 p-4 bg-white md:bg-transparent text-slate-200 hover:text-rose-500 rounded-2xl shadow-lg md:shadow-none transition-all group-hover:scale-110"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4 pt-8">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-6 bg-white border-2 border-slate-100 text-slate-400 rounded-[28px] font-black uppercase tracking-widest text-[11px] hover:bg-slate-50 transition-colors shadow-sm"
            >
              CANCELAR
            </button>
            <button
              type="submit"
              disabled={formSaving}
              className="flex-[2] py-6 bg-[#0f172a] text-white rounded-[28px] font-black uppercase tracking-widest shadow-2xl flex items-center justify-center gap-3 text-[11px] transition-all hover:bg-slate-800 hover:scale-[1.01] active:scale-95 disabled:opacity-50"
            >
              {formSaving ? 'GUARDANDO CAMBIOS...' : 'GUARDAR FICHA'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
