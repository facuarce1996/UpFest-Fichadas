import React from 'react';
import { Clock, Users, Building, LogOut, Key } from 'lucide-react';
import { User } from '../types';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser: User;
  onLogout: () => void;
  logoUrl: string | null;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
}

const getAIStudio = () => (typeof window !== 'undefined' ? (window as any).aistudio : null);
const isAIStudio = !!(getAIStudio() && getAIStudio().openSelectKey);

const handleOpenApiKeyDialog = async () => {
  if (isAIStudio) {
    try {
      await getAIStudio().openSelectKey();
    } catch (e) {
      console.error('Error abriendo selector de API key:', e);
    }
  }
};

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  onLogout,
  logoUrl,
  isMobileMenuOpen,
  setIsMobileMenuOpen,
}) => {
  const NavButton = ({ tab, icon: Icon, label }: { tab: string; icon: any; label: string }) => (
    <button
      onClick={() => {
        setActiveTab(tab);
        setIsMobileMenuOpen(false);
      }}
      className={`w-full flex items-center gap-4 px-6 py-4 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition ${
        activeTab === tab ? 'bg-orange-50 text-orange-700' : 'text-slate-400 hover:bg-slate-50'
      }`}
    >
      <Icon size={20} /> {label}
    </button>
  );

  return (
    <>
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[90] md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-[100] w-72 bg-white border-r border-slate-200 transform transition-transform duration-300 md:translate-x-0 md:static h-full flex flex-col ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-10 border-b flex flex-col items-center">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Logo"
              className="h-16 mb-4 object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          <div className={`w-16 h-16 bg-slate-900 text-white rounded-[24px] flex items-center justify-center font-black text-2xl mb-4 ${logoUrl ? 'hidden' : ''}`}>
            UP
          </div>
          <span className="font-black text-slate-900 tracking-tighter text-2xl">UPFEST</span>
        </div>
        <nav className="flex-1 p-8 space-y-2 overflow-y-auto">
          <NavButton tab="clock" icon={Clock} label={currentUser.role === 'Admin' ? 'Monitor' : 'Fichadas'} />
          {currentUser.role === 'Admin' && (
            <>
              <NavButton tab="admin" icon={Users} label="RRHH / Nómina" />
              <NavButton tab="locations" icon={Building} label="Salones / Sedes" />
            </>
          )}
        </nav>
        <div className="p-8 border-t space-y-2">
          {currentUser.role === 'Admin' && isAIStudio && (
            <button
              onClick={handleOpenApiKeyDialog}
              className="w-full flex items-center gap-4 px-6 py-3 rounded-[20px] text-[9px] font-black uppercase text-slate-400 border border-dashed hover:border-orange-500 transition-colors"
            >
              <Key size={18} /> Llave AI
            </button>
          )}
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-4 px-6 py-4 rounded-[20px] text-[10px] font-black uppercase text-red-400 hover:bg-red-50 transition-colors"
          >
            <LogOut size={20} /> Salir
          </button>
        </div>
      </aside>
    </>
  );
};
