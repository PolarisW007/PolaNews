'use client';

import Sidebar from './Sidebar';
import Header from './Header';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Sidebar />
      <Header />
      <main
        style={{
          marginLeft: 260,
          marginTop: 64,
          padding: 24,
          minHeight: 'calc(100vh - 64px)',
        }}
      >
        {children}
      </main>
    </div>
  );
}
