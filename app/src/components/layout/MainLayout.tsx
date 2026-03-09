'use client';

import { useState, useCallback } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => setSidebarOpen(prev => !prev), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      <Header onToggleSidebar={toggleSidebar} />
      <main className="lg:ml-[260px] mt-[56px] lg:mt-[64px] p-3 sm:p-4 lg:p-6 min-h-[calc(100vh-56px)] lg:min-h-[calc(100vh-64px)]">
        {children}
      </main>
    </div>
  );
}
