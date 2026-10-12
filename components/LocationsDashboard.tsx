import React, { useState, useEffect } from 'react';
import { 
  Building, Plus, Pencil, MapPin, Navigation, Target, Check, X, RefreshCw 
} from 'lucide-react';
import { Location } from '../types';
import { fetchLocations, saveLocation, deleteLocation, getCurrentPosition } from '../services/utils';
import { useFeedback } from '../services/feedbackContext';

export const LocationsDashboard: React.FC = () => {
  const { toast, confirm } = useFeedback();

  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingLoc, setEditingLoc] = useState<Location | null>(null);
  const [isCreatingLoc, setIsCreatingLoc] = useState(false);
  const [locSaving, setLocSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [locFormData, setLocFormData] = useState<Partial<Location>>({});
  const [currentLocId, setCurrentLocId] = useState<string | null>(
    typeof window !== 'undefined' ? localStorage.getItem('upfest_terminal_location_id') : null
  );

  const load = async () => {
    setLoading(true);
    try {
      setLocations(await fetchLocations());
    } catch (err: any) {
      console.error('Error al cargar sedes:', err);
      toast('Error al cargar sedes: ' + (err.message || String(err)), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (editingLoc) {
      setLocFormData({ ...editingLoc });
    } else {
      setLocFormData({ name: '', address: '', city: '', lat: 0, lng: 0, radiusMeters: 100 });
    }
  }, [editingLoc, isCreatingLoc]);

  const handleSaveLoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locFormData.name || locFormData.name.trim() === '') {
      toast('El nombre de la sede es obligatorio', 'warning');
      return;
    }

    setLocSaving(true);
    try {
      await saveLocation(locFormData as Location);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setEditingLoc(null);
        setIsCreatingLoc(false);
        load();
      }, 1500);
      toast('Sede guardada con éxito', 'success');
    } catch (err: any) {
      toast('Error al guardar sede: ' + err.message, 'error');
    } finally {
      setLocSaving(false);
    }
  };

  const handleDeleteLoc = async (locId: string, name: string) => {
    const ok = await confirm(`¿CONFIRMAS ELIMINAR LA SEDE "${name.toUpperCase()}"?`, {
      title: 'Eliminar Sede',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      isDestructive: true,
    });
    if (!ok) return;

    try {
      await deleteLocation(locId);
      toast(`Sede "${name}" eliminada`, 'success');
      load();
    } catch (err: any) {
      toast('Error al eliminar: ' + err.message, 'error');
    }
  };

  const fetchCurrentGPS = async () => {
    try {
      const pos = await getCurrentPosition();
      setLocFormData((prev) => ({
        ...prev,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      }));
      toast('Coordenadas GPS obtenidas', 'success');
    } catch (e: any) {
      toast('No se pudo obtener la ubicación GPS.', 'warning');
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-center mb-10 gap-4">
        <div className="text-center md:text-left">
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">
            Sedes / Salones
          </h1>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 italic">
            CONFIGURACIÓN DE GEOCERCAS
          </p>
        </div>
        <button
          onClick={() => {
            setEditingLoc(null);
            setIsCreatingLoc(true);
          }}
          className="w-full md:w-auto bg-slate-900 text-white px-8 py-4 rounded-2xl flex items-center justify-center gap-3 shadow-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-colors"
        >
          <Plus size={18} /> Nueva Sede
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        {loading ? (
          <div className="col-span-full py-20 text-center text-slate-300 font-black uppercase">
            Cargando sedes...
          </div>
        ) : locations.length === 0 ? (
          <div className="col-span-full py-20 text-center text-slate-300 font-black uppercase italic">
            Sin sedes registradas
          </div>
        ) : (
          locations.map((loc) => (
            <div
              key={loc.id}
              className={`p-8 bg-white border rounded-[40px] shadow-sm transition-all relative group ${
                currentLocId === loc.id
                  ? 'border-orange-500 ring-8 ring-orange-50'
                  : 'border-slate-100'
              }`}
            >
              <button
                onClick={() => setEditingLoc(loc)}
                className="absolute top-6 right-6 p-3 text-slate-300 hover:text-orange-600 transition-colors"
                title="Editar sede"
              >
                <Pencil size={18} />
              </button>
              <div
                className={`w-16 h-16 rounded-[24px] flex items-center justify-center mb-6 ${
                  currentLocId === loc.id
                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-100'
                    : 'bg-slate-50 text-slate-400'
                }`}
              >
                <Building size={24} />
              </div>
              <h3 className="font-black text-2xl text-slate-900 uppercase tracking-tighter mb-2 pr-10">
                {loc.name}
              </h3>
              <div className="space-y-2 mb-8">
                <p className="text-xs font-bold text-slate-500 flex items-center gap-2">
                  <MapPin size={14} className="text-slate-300" /> {loc.address || 'Sin dirección'}
                </p>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Navigation size={14} className="text-slate-300" /> {loc.lat?.toFixed(6)},{' '}
                  {loc.lng?.toFixed(6)}
                </p>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Target size={14} className="text-slate-300" /> Radio: {loc.radiusMeters}m
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    localStorage.setItem('upfest_terminal_location_id', loc.id);
                    setCurrentLocId(loc.id);
                    toast(`Terminal vinculada a ${loc.name}`, 'success');
                  }}
                  className={`flex-[2] py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${
                    currentLocId === loc.id
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {currentLocId === loc.id ? 'VINCULADA' : 'VINCULAR TERMINAL'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {(isCreatingLoc || editingLoc) && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] w-full max-w-2xl shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300">
            {saveSuccess && (
              <div className="absolute inset-0 bg-white/95 backdrop-blur-md z-[200] flex flex-col items-center justify-center animate-in fade-in duration-300">
                <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mb-6 animate-bounce shadow-xl border-4 border-white">
                  <Check size={48} className="text-emerald-600" />
                </div>
                <h3 className="text-3xl font-black uppercase tracking-tighter text-slate-900">
                  CAMBIOS REALIZADOS
                </h3>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setEditingLoc(null);
                setIsCreatingLoc(false);
              }}
              className="absolute top-8 right-8 p-3 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-400 transition-colors z-10"
            >
              <X size={20} />
            </button>

            <form onSubmit={handleSaveLoc} className="p-10 space-y-8">
              <div className="border-b pb-6">
                <h3 className="font-black text-2xl uppercase tracking-tighter text-slate-900">
                  {editingLoc ? 'EDITAR SEDE' : 'NUEVA SEDE'}
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="col-span-full space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                    Nombre del Salón / Sede
                  </label>
                  <input
                    type="text"
                    value={locFormData.name || ''}
                    onChange={(e) => setLocFormData({ ...locFormData, name: e.target.value })}
                    className="w-full p-5 bg-slate-50 rounded-[20px] font-black text-slate-900 outline-none uppercase text-sm border border-transparent focus:border-slate-200"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                    Dirección
                  </label>
                  <input
                    type="text"
                    value={locFormData.address || ''}
                    onChange={(e) => setLocFormData({ ...locFormData, address: e.target.value })}
                    className="w-full p-5 bg-slate-50 rounded-[20px] font-black text-slate-900 outline-none text-sm border border-transparent focus:border-slate-200"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                    Ciudad
                  </label>
                  <input
                    type="text"
                    value={locFormData.city || ''}
                    onChange={(e) => setLocFormData({ ...locFormData, city: e.target.value })}
                    className="w-full p-5 bg-slate-50 rounded-[20px] font-black text-slate-900 outline-none text-sm border border-transparent focus:border-slate-200"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                    Latitud
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={locFormData.lat || 0}
                    onChange={(e) => setLocFormData({ ...locFormData, lat: parseFloat(e.target.value) || 0 })}
                    className="w-full p-5 bg-slate-50 rounded-[20px] font-black text-slate-900 outline-none text-sm border border-transparent focus:border-slate-200"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                    Longitud
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={locFormData.lng || 0}
                    onChange={(e) => setLocFormData({ ...locFormData, lng: parseFloat(e.target.value) || 0 })}
                    className="w-full p-5 bg-slate-50 rounded-[20px] font-black text-slate-900 outline-none text-sm border border-transparent focus:border-slate-200"
                    required
                  />
                </div>
                <div className="col-span-full flex gap-4">
                  <div className="flex-1 space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                      Radio de Tolerancia (Metros)
                    </label>
                    <input
                      type="number"
                      value={locFormData.radiusMeters || 100}
                      onChange={(e) =>
                        setLocFormData({ ...locFormData, radiusMeters: parseInt(e.target.value) || 100 })
                      }
                      className="w-full p-5 bg-slate-50 rounded-[20px] font-black text-slate-900 outline-none text-sm border border-transparent focus:border-slate-200"
                      required
                    />
                  </div>
                  <div className="flex-1 pt-6">
                    <button
                      type="button"
                      onClick={fetchCurrentGPS}
                      className="w-full h-full bg-orange-50 text-orange-600 border-2 border-orange-100 rounded-[20px] font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-orange-100 transition-all"
                    >
                      <Navigation size={18} /> Usar mi GPS
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-4 pt-4">
                {editingLoc && (
                  <button
                    type="button"
                    onClick={() => handleDeleteLoc(editingLoc.id, editingLoc.name)}
                    className="py-5 bg-rose-50 text-rose-600 rounded-[24px] font-black uppercase tracking-widest text-[10px] px-8 hover:bg-rose-100 transition-colors"
                  >
                    ELIMINAR
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setEditingLoc(null);
                    setIsCreatingLoc(false);
                  }}
                  className="flex-1 py-5 bg-white border-2 border-slate-100 text-slate-400 rounded-[24px] font-black uppercase tracking-widest text-[10px] hover:bg-slate-50 transition-colors"
                >
                  CANCELAR
                </button>
                <button
                  type="submit"
                  disabled={locSaving}
                  className="flex-[2] py-5 bg-[#0f172a] text-white rounded-[24px] font-black uppercase tracking-widest text-[10px] shadow-2xl flex items-center justify-center gap-3 transition-all hover:bg-slate-800 disabled:opacity-50"
                >
                  {locSaving ? <RefreshCw className="animate-spin" size={18} /> : 'GUARDAR SEDE'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
