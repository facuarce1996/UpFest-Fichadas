import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, Plus, FileSpreadsheet, FileUp, Download, ImageIcon, 
  Search, XCircle, Pencil, Trash2, RefreshCw, AlertTriangle 
} from 'lucide-react';
import { User, Location, DEFAULT_ROLES } from '../types';
import { 
  fetchUsers, fetchLocations, deleteUser, checkDatabaseHealth, 
  uploadImage, saveCompanyLogo, saveUser 
} from '../services/utils';
import { exportUsersReport, exportTemplateRRHH, parseExcelUsers } from '../services/excelExport';
import { useFeedback } from '../services/feedbackContext';
import { UserEditModal } from './modals/UserEditModal';
import { ZoomedImageModal } from './modals/ZoomedImageModal';

export const AdminDashboard: React.FC = () => {
  const { toast, confirm } = useFeedback();

  const [users, setUsers] = useState<User[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbHealthy, setDbHealthy] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [importing, setImporting] = useState(false);
  const [isDeletingUser, setIsDeletingUser] = useState<string | null>(null);

  // Modals state
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [zoomedUserImage, setZoomedUserImage] = useState<string | null>(null);

  const importInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [u, l, healthy] = await Promise.all([
        fetchUsers(),
        fetchLocations(),
        checkDatabaseHealth(),
      ]);
      setUsers(u);
      setLocations(l);
      setDbHealthy(healthy);
    } catch (err: any) {
      console.error('Error al cargar nómina:', err);
      toast('Error al cargar nómina: ' + (err.message || String(err)), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const availableRoles = Array.from(new Set([...DEFAULT_ROLES, ...users.map((u) => u.role)])).filter(Boolean);

  const handleDownloadTemplate = async () => {
    try {
      await exportTemplateRRHH();
      toast('Plantilla descargada con éxito', 'success');
    } catch (err: any) {
      toast('Error al descargar plantilla: ' + err.message, 'error');
    }
  };

  const handleExportUsers = async () => {
    try {
      await exportUsersReport(users);
      toast('Nómina exportada con éxito', 'success');
    } catch (err: any) {
      toast('Error al exportar usuarios: ' + err.message, 'error');
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const { users: parsedUsers, convertedAdminCount } = await parseExcelUsers(file);
      for (const newUser of parsedUsers) {
        if (newUser.name && newUser.dni) {
          await saveUser(newUser);
        }
      }

      let msg = 'Importación completada exitosamente.';
      if (convertedAdminCount > 0) {
        msg += ` Nota: ${convertedAdminCount} usuario(s) con rol 'Admin' fueron convertidos a 'Mozo' por seguridad.`;
      }
      toast(msg, 'success');
      load();
    } catch (err: any) {
      console.error('Error procesando archivo Excel:', err);
      toast('Error procesando archivo: ' + err.message, 'error');
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const handleDeleteUserDirect = async (userId: string, userName: string) => {
    const ok = await confirm(
      `¿CONFIRMAS BORRAR A ${userName.toUpperCase()}? ESTA ACCIÓN NO SE PUEDE DESHACER.`,
      {
        title: 'Eliminar Colaborador',
        confirmText: 'Borrar Definitivamente',
        cancelText: 'Cancelar',
        isDestructive: true,
      }
    );
    if (!ok) return;

    setIsDeletingUser(userId);
    try {
      await deleteUser(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      toast(`Colaborador ${userName} eliminado`, 'success');
    } catch (err: any) {
      toast('Error al borrar: ' + err.message, 'error');
    } finally {
      setIsDeletingUser(null);
    }
  };

  const handleChangeLogo = () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const res = reader.result as string;
            const timestamp = new Date().getTime();
            const fileName = `logos/logo_${timestamp}.jpg`;
            const finalUrl = await uploadImage(res, 'fichadas', fileName);
            await saveCompanyLogo(finalUrl);
            toast('Logo actualizado con éxito. Recarga la página para ver los cambios.', 'success');
          } catch (uploadErr: any) {
            toast('Error al subir logo: ' + uploadErr.message, 'error');
          }
        };
        reader.readAsDataURL(file);
      } catch (err: any) {
        toast('Error leyendo imagen: ' + err.message, 'error');
      }
    };
    fileInput.click();
  };

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.dni.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8 animate-in fade-in">
      <ZoomedImageModal imageUrl={zoomedUserImage} onClose={() => setZoomedUserImage(null)} />

      {!dbHealthy && (
        <div className="bg-rose-50 border border-rose-200 p-6 rounded-[24px] flex flex-col md:flex-row items-center gap-4 animate-bounce shadow-xl mb-6">
          <AlertTriangle className="text-rose-600 shrink-0" size={32} />
          <div className="flex-1 text-center md:text-left">
            <p className="font-black text-[10px] uppercase tracking-widest text-rose-700">
              ERROR DE CONEXIÓN CRÍTICO
            </p>
            <p className="text-xs font-bold text-rose-900 leading-tight">
              La base de datos no responde (TIMEOUT). Es muy probable que el proyecto de Supabase esté{' '}
              <span className="underline decoration-wavy decoration-rose-500 mx-1">PAUSADO</span> por inactividad.
            </p>
            <p className="text-[10px] mt-1 text-rose-800">
              Solución: Ingresa a tu panel de Supabase y haz clic en "Restore Project".
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="bg-rose-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-rose-700 transition-colors"
          >
            Reintentar
          </button>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div className="text-center md:text-left">
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Personal</h1>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
            Nómina UpFest Control
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button
            onClick={handleDownloadTemplate}
            className="flex-1 md:flex-none bg-emerald-50 text-emerald-600 border border-emerald-200 px-6 py-4 rounded-2xl flex items-center justify-center gap-3 shadow-sm font-black text-[10px] uppercase tracking-widest hover:bg-emerald-100 transition-all"
          >
            <FileSpreadsheet size={18} /> Descargar Plantilla
          </button>
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
            className="flex-1 md:flex-none bg-blue-50 text-blue-600 border border-blue-200 px-6 py-4 rounded-2xl flex items-center justify-center gap-3 shadow-sm font-black text-[10px] uppercase tracking-widest hover:bg-blue-100 transition-all"
          >
            {importing ? <RefreshCw className="animate-spin" size={18} /> : <FileUp size={18} />}{' '}
            {importing ? 'Subiendo...' : 'Importar Excel'}
          </button>
          <input
            type="file"
            ref={importInputRef}
            onChange={handleImportExcel}
            className="hidden"
            accept=".xlsx,.xls"
          />
          <button
            onClick={handleExportUsers}
            className="flex-1 md:flex-none bg-white text-slate-700 border border-slate-200 px-6 py-4 rounded-2xl flex items-center justify-center gap-3 shadow-sm font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all"
          >
            <Download size={18} /> Exportar a Excel
          </button>
          <button
            onClick={handleChangeLogo}
            className="flex-1 md:flex-none bg-indigo-50 text-indigo-600 border border-indigo-200 px-6 py-4 rounded-2xl flex items-center justify-center gap-3 shadow-sm font-black text-[10px] uppercase tracking-widest hover:bg-indigo-100 transition-all"
          >
            <ImageIcon size={18} /> Cambiar Logo
          </button>
          <button
            onClick={() => {
              setEditingUser(null);
              setIsUserModalOpen(true);
            }}
            className="flex-1 md:flex-none bg-slate-900 text-white px-8 py-4 rounded-2xl flex items-center justify-center gap-3 shadow-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-colors"
          >
            <Plus size={18} /> Nuevo Colaborador
          </button>
        </div>
      </div>

      <div className="mb-6 relative group">
        <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-slate-400 group-focus-within:text-orange-600 transition-colors">
          <Search size={22} />
        </div>
        <input
          type="text"
          placeholder="BUSCAR POR NOMBRE O DNI..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-16 pr-8 py-6 bg-white border-2 border-slate-100 rounded-[24px] font-black uppercase text-xs tracking-widest outline-none focus:border-orange-500 shadow-sm transition-all placeholder:text-slate-300"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute inset-y-0 right-6 flex items-center text-slate-300 hover:text-rose-500"
          >
            <XCircle size={20} />
          </button>
        )}
      </div>

      <div className="bg-white rounded-[32px] border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b">
                <th className="p-6 text-[10px] font-black uppercase">Colaborador</th>
                <th className="p-6 text-[10px] font-black uppercase">DNI</th>
                <th className="p-6 text-[10px] font-black uppercase">Rol</th>
                <th className="p-6 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={4} className="p-20 text-center text-slate-300 font-black uppercase">
                    Cargando nómina...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-20 text-center text-slate-300 font-black uppercase italic">
                    Sin personal para mostrar {searchTerm && `con el término "${searchTerm}"`}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-6 flex items-center gap-4">
                      <div
                        onClick={() => u.photoRef && setZoomedUserImage(u.photoRef)}
                        className="w-10 h-10 rounded-xl bg-slate-100 overflow-hidden border shrink-0 cursor-zoom-in"
                      >
                        {u.photoRef ? (
                          <img
                            src={u.photoRef}
                            alt={u.name}
                            loading="lazy"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div
                          className={`w-full h-full flex items-center justify-center bg-slate-100 text-slate-400 text-xs font-black uppercase ${
                            u.photoRef ? 'hidden' : ''
                          }`}
                        >
                          {u.name.charAt(0)}
                        </div>
                      </div>
                      <span className="font-black text-slate-800 uppercase text-sm">{u.name}</span>
                    </td>
                    <td className="p-6 text-xs font-bold text-slate-500 font-mono">{u.dni}</td>
                    <td className="p-6 text-[10px] font-black uppercase text-slate-700">{u.role}</td>
                    <td className="p-6 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            setEditingUser(u);
                            setIsUserModalOpen(true);
                          }}
                          className="p-3 text-slate-300 hover:text-orange-600 transition-colors"
                          title="Editar"
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          disabled={isDeletingUser === u.id}
                          onClick={() => handleDeleteUserDirect(u.id, u.name)}
                          className="p-3 text-slate-300 hover:text-rose-600 transition-colors"
                          title="Borrar Definitivamente"
                        >
                          {isDeletingUser === u.id ? (
                            <RefreshCw className="animate-spin" size={18} />
                          ) : (
                            <Trash2 size={18} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <UserEditModal
        isOpen={isUserModalOpen}
        user={editingUser}
        locations={locations}
        availableRoles={availableRoles}
        onClose={() => {
          setIsUserModalOpen(false);
          setEditingUser(null);
        }}
        onSuccess={() => {
          setIsUserModalOpen(false);
          setEditingUser(null);
          load();
        }}
      />
    </div>
  );
};
