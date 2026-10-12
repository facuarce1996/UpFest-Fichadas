import React, { useState } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import { User } from '../types';
import { authenticateUser } from '../services/utils';

interface LoginViewProps {
  onLogin: (u: User) => void;
  logoUrl: string | null;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin, logoUrl }) => {
  const [dni, setDni] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [requirePassword, setRequirePassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isGuestMode, setIsGuestMode] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedDni = dni.trim();
    // Validar que el DNI sea numérico de 7 u 8 dígitos antes de enviar (el admin por defecto '00000000' también debe pasar)
    const dniRegex = /^\d{7,8}$/;
    if (!dniRegex.test(trimmedDni)) {
      setError('El DNI debe ser numérico de 7 u 8 dígitos');
      return;
    }

    setLoading(true);
    try {
      const user = await authenticateUser(trimmedDni, isGuestMode, requirePassword ? password : undefined);
      if (user) {
        onLogin(user);
      } else {
        setError('DNI NO ENCONTRADO EN LA BASE DE EMPLEADOS');
      }
    } catch (err: any) {
      if (err.requirePassword) {
        setRequirePassword(true);
        setError(err.message === 'Contraseña requerida' ? 'Ingrese la contraseña de Administrador' : err.message);
      } else if (err.message === 'CUENTA DESACTIVADA') {
        setError('CUENTA DESACTIVADA');
      } else if (err.message?.includes('sin conexión') || err.message?.includes('offline')) {
        setError(err.message);
      } else if (err.message?.includes('TIMEOUT') || err.message?.includes('base de datos')) {
        setError(
          'ERROR CRÍTICO: La base de datos no responde. Es probable que el proyecto Supabase esté PAUSADO. Contacta al administrador.'
        );
      } else {
        setError(err.message || 'Error al iniciar sesión');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-sm bg-white rounded-[48px] shadow-2xl p-14 border relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-slate-900"></div>
        {isGuestMode && (
          <button
            onClick={() => {
              setIsGuestMode(false);
              setRequirePassword(false);
              setPassword('');
              setError('');
            }}
            className="absolute top-6 left-6 text-slate-400 hover:text-slate-900 transition-colors"
          >
            <X size={20} />
          </button>
        )}
        <div className="text-center mt-4">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Logo"
              className="h-20 mx-auto mb-8 object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          <div
            className={`w-24 h-24 bg-slate-900 rounded-[32px] flex items-center justify-center mx-auto mb-8 text-white font-black text-4xl shadow-2xl ${
              logoUrl ? 'hidden' : ''
            }`}
          >
            UP
          </div>
          <h2 className="text-3xl font-black mb-2 uppercase tracking-tighter text-slate-800">UPFEST</h2>
          <p className="text-slate-400 font-black text-[10px] uppercase tracking-widest">
            {isGuestMode ? 'REGISTRO DE INVITADO' : 'CONTROL BIOMÉTRICO'}
          </p>
        </div>
        <form onSubmit={handleLogin} className="space-y-6 mt-12">
          <div className="space-y-2">
            <input
              type="text"
              inputMode="numeric"
              value={dni}
              onChange={(e) => {
                setDni(e.target.value);
                if (requirePassword) {
                  setRequirePassword(false);
                  setPassword('');
                }
              }}
              className="w-full px-8 py-5 border border-slate-200 rounded-[20px] font-bold outline-none focus:ring-4 focus:ring-blue-500/5 transition-all bg-slate-50/50 text-slate-900"
              placeholder="INGRESA TU DNI"
              required
            />
          </div>

          {requirePassword && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">
                Contraseña de Administrador
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-8 py-5 border border-slate-200 rounded-[20px] font-bold outline-none focus:ring-4 focus:ring-blue-500/5 transition-all bg-slate-50/50 text-slate-900 pr-14"
                  placeholder="CONTRASEÑA"
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRequirePassword(false);
                  setPassword('');
                  setError('');
                }}
                className="text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest mt-1 block"
              >
                ← Cambiar DNI
              </button>
            </div>
          )}

          {error && (
            <div className="text-red-500 text-[10px] font-black text-center uppercase animate-pulse">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full font-black py-5 rounded-[20px] shadow-xl transition-all disabled:opacity-50 text-sm uppercase tracking-widest ${
              isGuestMode ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            {loading ? 'CONECTANDO...' : requirePassword ? 'VERIFICAR CONTRASEÑA' : 'INGRESAR'}
          </button>

          {!isGuestMode && !requirePassword && (
            <button
              type="button"
              onClick={() => {
                setIsGuestMode(true);
                setRequirePassword(false);
                setPassword('');
                setError('');
              }}
              className="w-full py-3 text-[10px] font-black uppercase text-slate-400 hover:text-slate-900 tracking-widest transition-colors mt-4 bg-transparent"
            >
              Ingresar como invitado
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
