"use client";

import type { Session } from "next-auth";
import { useState } from "react";
import TopNav from "@/components/layout/TopNav";
import Sidebar from "@/components/layout/Sidebar";

export default function AppShell({
  session,
  notificationBadge,
  cartBadge,
  children,
}: {
  session: Session;
  notificationBadge?: React.ReactNode;
  cartBadge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav session={session} onMenuClick={() => setSidebarOpen(true)} notificationBadge={notificationBadge} cartBadge={cartBadge} />

      <div className="flex pt-16 min-h-screen">
        <Sidebar
          role={session.user.role}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <main
          id="main-content"
          className="flex-1 lg:ml-64 p-4 lg:p-8 w-full max-w-7xl mx-auto"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
