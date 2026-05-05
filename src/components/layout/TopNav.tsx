"use client";

import type { Session } from "next-auth";
import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Menu, Bell, ShoppingCart, ChevronDown, LogOut, Settings, User, Award } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TruemarkLogoColour } from "@/components/TruemarkLogo";
import { cn } from "@/lib/utils";

const ROLE_BADGE: Record<string, string> = {
  SUPER_ADMIN: "bg-red-100 text-red-700",
  CERTIFICATION_OFFICER: "bg-blue-100 text-blue-700",
  EXAMINER: "bg-purple-100 text-purple-700",
  TRAINER: "bg-amber-100 text-amber-700",
  PROCTOR: "bg-orange-100 text-orange-700",
  AUDITOR: "bg-slate-100 text-slate-700",
  ORG_MANAGER: "bg-indigo-100 text-indigo-700",
  CANDIDATE: "bg-emerald-100 text-emerald-700",
  SUPPORT_AGENT: "bg-teal-100 text-teal-700",
};

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  CERTIFICATION_OFFICER: "Certification Officer",
  EXAMINER: "Examiner",
  TRAINER: "Trainer",
  PROCTOR: "Proctor",
  AUDITOR: "Auditor",
  ORG_MANAGER: "Org Manager",
  CANDIDATE: "Candidate",
  SUPPORT_AGENT: "Support Agent",
};

export default function TopNav({
  session,
  onMenuClick,
  notificationBadge,
  cartBadge,
}: {
  session: Session;
  onMenuClick: () => void;
  notificationBadge?: React.ReactNode;
  cartBadge?: React.ReactNode;
}) {
  const router = useRouter();
  const { user } = session;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const initials = `${user.name?.split(" ")[0]?.[0] ?? ""}${user.name?.split(" ")[1]?.[0] ?? ""}`.toUpperCase();

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function navigate(href: string) {
    setMenuOpen(false);
    router.push(href);
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
      <div className="flex items-center justify-between h-full px-4 sm:px-6">

        {/* Left: hamburger + logo */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <Link href="/dashboard" className="flex items-center gap-2.5">
            <TruemarkLogoColour className="w-9 h-9 shrink-0" />
            <div className="hidden sm:block">
              <p className="font-bold text-sm text-slate-900 leading-tight">Truemark Global</p>
              <p className="text-[10px] text-primary font-medium leading-tight">Certification Portal</p>
            </div>
          </Link>
        </div>

        {/* Right: notification bell + user menu */}
        <div className="flex items-center gap-2">

          {/* Cart */}
          <button
            type="button"
            onClick={() => router.push("/cart")}
            className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
            aria-label="Shopping cart"
          >
            <ShoppingCart className="w-5 h-5" />
            {cartBadge}
          </button>

          {/* Notifications */}
          <button
            type="button"
            onClick={() => router.push("/notifications")}
            className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
            {notificationBadge}
          </button>

          {/* User menu */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 pl-3 border-l border-slate-200 hover:bg-slate-50 rounded-lg p-1.5 transition"
              aria-label="User menu"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <div className="hidden sm:block text-right">
                <p className="text-sm font-semibold text-slate-900 leading-tight">{user.name}</p>
                <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", ROLE_BADGE[user.role] ?? "bg-slate-100 text-slate-700")}>
                  {ROLE_LABEL[user.role] ?? user.role}
                </span>
              </div>
              <Avatar className="w-9 h-9 border-2 border-white shadow-sm">
                <AvatarImage src={user.image ?? undefined} alt={user.name ?? ""} />
                <AvatarFallback className="bg-primary text-white text-xs font-bold">{initials}</AvatarFallback>
              </Avatar>
              <ChevronDown className={cn("w-3 h-3 text-slate-400 hidden sm:block transition-transform", menuOpen && "rotate-180")} />
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <div
                role="menu"
                aria-label="User menu"
                className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl border border-slate-200 shadow-xl z-50 py-1 overflow-hidden"
              >
                {/* Header */}
                <div className="px-3 py-2.5 border-b border-slate-100" role="presentation">
                  <p className="font-semibold text-sm text-slate-900 truncate">{user.name}</p>
                  <p className="text-xs text-slate-500 truncate">{user.email}</p>
                </div>

                {/* Items */}
                <div className="py-1" role="presentation">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => navigate("/profile")}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition text-left"
                  >
                    <User className="w-4 h-4 text-slate-400" aria-hidden="true" /> Profile
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => navigate("/certificates")}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition text-left"
                  >
                    <Award className="w-4 h-4 text-slate-400" aria-hidden="true" /> My Certificates
                  </button>
                  {(user.role === "SUPER_ADMIN") && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => navigate("/settings")}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition text-left"
                    >
                      <Settings className="w-4 h-4 text-slate-400" aria-hidden="true" /> Settings
                    </button>
                  )}
                </div>

                {/* Sign out */}
                <div className="border-t border-slate-100 py-1" role="presentation">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      signOut({ callbackUrl: "/login" });
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition text-left"
                  >
                    <LogOut className="w-4 h-4" aria-hidden="true" /> Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
