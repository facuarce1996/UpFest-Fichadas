import React, { useState, useEffect, useCallback } from 'react';
import { Menu } from 'lucide-react';
import { User } from './types';
import { checkDatabaseHealth, fetchCompanyLogo, syncPendingLogs } from './services/utils';
import { FeedbackProvider } from './services/feedbackContext';
import { LoginView } from './components/LoginView';
import { Sidebar } from './components/Sidebar';
import { ClockView } from './components/ClockView';
import { AdminDashboard } from './components/AdminDashboard';
import { LocationsDashboard } from './components/LocationsDashboard';

function AppContent() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('clock');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = useCallback(() => {
    setCurrentUser(null);
    setActiveTab('clock');
    setIsMobileMenuOpen(false);
  }, []);

  // Sesión de Admin: cerrar sesión automáticamente tras 15 minutos de inactividad
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'Admin') return;

    const INACTIVITY_LIMIT_MS = 15 * 60 * 1000; // 15 minutos
    let timer: NodeJS.Timeout | null = null;

    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        handleLogout();
      }, INACTIVITY_LIMIT_MS);
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      if (timer) clearTimeout(timer);
      events.forEach((evt) => window.removeEventListener(evt, resetTimer));
    };
  }, [currentUser, handleLogout]);

  useEffect(() => {
    checkDatabaseHealth().catch((err) => {
      console.error('Error en health check inicial:', err?.message || err);
    });
    fetchCompanyLogo().then(setLogoUrl).catch(() => {});

    // Sincronizar fichadas offline:
    // 1. Al iniciar la app
    syncPendingLogs();

    // 2. Al evento window 'online'
    const handleOnline = () => {
      syncPendingLogs();
    };
    window.addEventListener('online', handleOnline);

    // 3. Cada 2 minutos
    const syncInterval = setInterval(() => {
      syncPendingLogs();
    }, 2 * 60 * 1000);

    return () => {
      window.removeEventListener('online', handleOnline);
      clearInterval(syncInterval);
    };
  }, []);

  if (!currentUser) {
    return (
      <LoginView
        onLogin={(u: User) => {
          setCurrentUser(u);
          setActiveTab('clock');
        }}
        logoUrl={logoUrl}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row overflow-hidden text-slate-900">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        onLogout={handleLogout}
        logoUrl={logoUrl}
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="md:hidden bg-white/80 backdrop-blur-md border-b px-6 py-4 flex items-center justify-between z-50 sticky top-0">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 -ml-2 text-slate-600"
            aria-label="Abrir menú"
          >
            <Menu size={24} />
          </button>
          <span className="font-black text-lg tracking-tighter">UPFEST</span>
          <div className="w-10"></div>
        </header>
        <main className="flex-1 overflow-y-auto scroll-smooth">
          <div className="pb-20 md:pb-0">
            {activeTab === 'clock' && <ClockView user={currentUser} onLogout={handleLogout} />}
            {activeTab === 'admin' && <AdminDashboard />}
            {activeTab === 'locations' && <LocationsDashboard />}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <FeedbackProvider>
      <AppContent />
    </FeedbackProvider>
  );
}
