"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  LayoutDashboard, BookOpen, FileText, Award, Users, Building2,
  BarChart3, Shield, ShieldCheck, ClipboardList, FolderOpen, MessageSquare,
  Settings, HelpCircle, X, TrendingUp, Package, BadgeCheck, Bell,
  UserCircle, Eye, Scale, Crown, CreditCard, KeyRound, ClipboardCheck, ListChecks,
  MessageSquareWarning,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/constants";

// requiredPermission: a single "resource:action", an array meaning "any of
// these" (e.g. Staff is reachable via either staff:manage or
// organisations:members — two unrelated capabilities that both lead here),
// or omitted to always show (e.g. Dashboard, Profile, or a page — like
// Appeals/Support — that has no access gate at all and adapts its own
// content per viewer).
//
// allowedRoles: an upper bound on top of requiredPermission, matching the
// same ceiling can(session, permission, allowedRoles) enforces at the page
// itself. A handful of coarse permissions (courses:read, certifications:read,
// exams:read) are held broadly for unrelated, legitimate reasons — browsing a
// catalog, viewing your own certificate, live-proctoring an exam — that have
// nothing to do with the *admin management panel* these particular items
// link to. Without the ceiling, e.g. a CANDIDATE holding courses:read (for
// browsing courses) would see a "Manage Courses" link into the admin panel,
// which the page itself has always restricted to SUPER_ADMIN/CO/TRAINER.
// Only present where the destination page carries the same ceiling — see
// each page's own can(..., allowedRoles) call for the source of truth.
type NavItem = { label: string; href: string; icon: React.ElementType; requiredPermission?: string | string[]; allowedRoles?: UserRole[] };
type NavSection = { heading?: string; items: NavItem[] };

// ── Canonical navigation — one definition per destination, filtered per user ──
//
// This used to be a per-built-in-role lookup table (ROLE_NAV[role]): nine
// hardcoded arrays, one per built-in role string. That meant a user assigned
// an *additional* custom role (via UserCustomRole, on top of their base role)
// could gain real access to a page — can() correctly grants it — with no way
// to discover it, because the fixed array for their base role simply never
// listed it. A custom role could only ever narrow what was already in that
// one array, never add to it.
//
// Nav visibility is now purely a function of the live permission set (base
// role + every assigned custom role, exactly what can() already checks) —
// the same mechanism, extended to navigation. Every section below is
// evaluated for every user; empty sections (no items the viewer can see)
// are dropped. A handful of items are intentionally permission-free — pages
// with no real access gate of their own (Support, Appeals), which correctly
// generalizes to "visible for anyone" rather than requiring a guess at which
// specific permission should stand in for "no gate at all".
const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Dashboard",     href: "/dashboard",     icon: LayoutDashboard },
      { label: "Notifications", href: "/notifications", icon: Bell },
    ],
  },
  {
    heading: "Learning",
    items: [
      { label: "My Courses",   href: "/courses",      icon: BookOpen,   requiredPermission: "courses:read" },
      { label: "My Exams",     href: "/exams",         icon: FileText,   requiredPermission: "exams:take" },
      { label: "Certificates", href: "/certificates",  icon: Award,      requiredPermission: "certifications:read" },
      { label: "CPD Log",      href: "/cpd",           icon: TrendingUp, requiredPermission: "cpd:read" },
    ],
  },
  {
    heading: "Content & Exams",
    items: [
      { label: "Manage Courses",  href: "/manage/courses",     icon: BookOpen,      requiredPermission: "courses:read", allowedRoles: ["SUPER_ADMIN", "CERTIFICATION_OFFICER", "TRAINER"] },
      { label: "SCORM Packages",  href: "/manage/scorm",       icon: Package,       requiredPermission: "scorm:manage" },
      { label: "Documents",       href: "/documents",          icon: FolderOpen,    requiredPermission: "documents:read" },
      { label: "Exam Papers",     href: "/manage/exams",       icon: ClipboardList, requiredPermission: "exams:read", allowedRoles: ["SUPER_ADMIN", "CERTIFICATION_OFFICER", "EXAMINER"] },
      { label: "Grade Queue",     href: "/manage/grade-queue", icon: ListChecks,    requiredPermission: "exams:grade" },
    ],
  },
  {
    heading: "Certification",
    items: [
      { label: "Applications",          href: "/manage/applications", icon: ClipboardList, requiredPermission: "applications:read" },
      { label: "Decisions",             href: "/manage/decisions",    icon: BadgeCheck,    requiredPermission: "decisions:manage" },
      { label: "Manage Certificates",   href: "/manage/certificates", icon: Award,         requiredPermission: "certifications:read", allowedRoles: ["SUPER_ADMIN", "CERTIFICATION_OFFICER", "AUDITOR"] },
      { label: "Certification Schemes", href: "/manage/schemes",      icon: Shield,        requiredPermission: "schemes:read" },
    ],
  },
  {
    heading: "Compliance & Audit",
    items: [
      { label: "ISO 17024 Status",  href: "/compliance",      icon: ShieldCheck,    requiredPermission: "compliance:read" },
      { label: "Audit Programme",   href: "/audit-programme", icon: ClipboardCheck, requiredPermission: "auditProgramme:read" },
      { label: "Audit Log",         href: "/audit",           icon: ClipboardList,  requiredPermission: "audit:read" },
      { label: "Reports",           href: "/reports",         icon: BarChart3,      requiredPermission: "reports:read" },
      { label: "Management Review", href: "/manage/review",   icon: FileText,       requiredPermission: "auditProgramme:create" },
    ],
  },
  {
    heading: "Organisation",
    items: [
      { label: "Organisations",     href: "/organisations",         icon: Building2, requiredPermission: "organisations:read" },
      // organisations:members is also held by SUPER_ADMIN/CO, but the page
      // itself is ORG_MANAGER-exclusive by design — admins use
      // /organisations/{id} instead. Ceiling matches that hard gate.
      { label: "Members & Courses", href: "/organisations/members", icon: Users,     requiredPermission: "organisations:members", allowedRoles: ["ORG_MANAGER"] },
      // Staff is reachable two ways: SUPER_ADMIN manages staff platform-wide
      // (staff:manage); an ORG_MANAGER only views their own org's roster
      // (organisations:members) — see src/app/(dashboard)/staff/page.tsx.
      { label: "Staff", href: "/staff", icon: Users, requiredPermission: ["staff:manage", "organisations:members"] },
    ],
  },
  {
    heading: "Support",
    items: [
      // No permission — src/app/(dashboard)/support/page.tsx has no access
      // gate; it renders a different view (own tickets vs. the full queue)
      // depending on the viewer, same as Appeals below.
      { label: "Support", href: "/support", icon: MessageSquare },
      { label: "Appeals",  href: "/appeals", icon: Scale },
      // /complaints itself redirects SUPER_ADMIN/CERTIFICATION_OFFICER to
      // /manage/complaints (admins manage complaints, they don't file them) —
      // ceiling matches that redirect so the link doesn't dead-end for them.
      { label: "My Complaints",    href: "/complaints",        icon: MessageSquareWarning, requiredPermission: "appeals:submit", allowedRoles: ["EXAMINER", "TRAINER", "PROCTOR", "AUDITOR", "ORG_MANAGER", "CANDIDATE", "SUPPORT_AGENT"] },
      { label: "Manage Complaints", href: "/manage/complaints", icon: MessageSquare,        requiredPermission: "appeals:manage" },
    ],
  },
  {
    heading: "Monitoring",
    items: [
      { label: "Live Monitoring", href: "/proctor", icon: Eye, requiredPermission: "exams:proctor" },
    ],
  },
  {
    heading: "Platform Admin",
    items: [
      // src/app/(dashboard)/platform/layout.tsx gates the entire /platform/*
      // subtree on permissions:manage alone — none of these 5 pages have a
      // page-level check of their own (verified directly). Gating each item
      // here on its own more-specific-sounding permission (organisations:read,
      // users:read, etc.) would show a link that still hits the layout's
      // redirect for anyone who lacks permissions:manage specifically —
      // matching the item to the *real* boundary avoids that dead link.
      { label: "Platform Overview", href: "/platform",               icon: Crown,      requiredPermission: "permissions:manage" },
      { label: "All Users",         href: "/platform/users",         icon: Users,      requiredPermission: "permissions:manage" },
      { label: "Payments",          href: "/platform/payments",      icon: CreditCard, requiredPermission: "permissions:manage" },
      { label: "Registrations",     href: "/platform/registrations", icon: BookOpen,   requiredPermission: "permissions:manage" },
      { label: "Permissions",       href: "/platform/permissions",   icon: KeyRound,   requiredPermission: "permissions:manage" },
      { label: "Settings",          href: "/settings",               icon: Settings,   requiredPermission: "settings:manage" },
    ],
  },
  {
    heading: "Account",
    items: [
      { label: "My Profile", href: "/profile", icon: UserCircle },
    ],
  },
];

// ── Nav content (shared between the desktop and mobile shells) ─────────────────
// Declared outside Sidebar so it isn't recreated as a new component identity on
// every render — everything it needs is passed in explicitly rather than
// captured via closure.

function SidebarContent({
  sections,
  pathname,
  showHelpBox,
  onClose,
}: {
  sections: NavSection[];
  pathname: string;
  showHelpBox: boolean;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <nav className="flex-1 px-3 py-4 overflow-y-auto" aria-label="Main navigation">
        {sections.map((section, si) => (
          <div key={si} className={si > 0 ? "mt-4" : ""}>
            {section.heading && (
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400 select-none">
                {section.heading}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href + item.label}
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all relative group",
                      active
                        ? "bg-accent text-primary"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-0.75 bg-primary rounded-r-full" />
                    )}
                    <Icon className={cn(
                      "w-4 h-4 shrink-0 transition-colors",
                      active ? "text-primary" : "text-slate-400 group-hover:text-slate-600"
                    )} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Help box — anyone who can submit an appeal about their own results
          (candidates, and org managers acting on their org's behalf). */}
      {showHelpBox && (
        <div className="px-4 py-4 border-t border-slate-200 shrink-0">
          <div className="bg-accent rounded-xl p-4 border border-primary/20">
            <div className="flex items-center gap-2 mb-1">
              <HelpCircle className="w-4 h-4 text-primary" />
              <h4 className="font-semibold text-sm text-primary">Need Help?</h4>
            </div>
            <p className="text-xs text-slate-600 mb-3">
              Questions about your results or certification? Submit an appeal.
            </p>
            <Link
              href="/support"
              onClick={onClose}
              className="block w-full bg-primary text-white py-2 rounded-lg text-xs font-medium hover:bg-primary/90 transition text-center"
            >
              Contact Support
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Sidebar({
  role,
  permissions,
  open,
  onClose,
}: {
  /** The user's base built-in role — used only as the allowedRoles ceiling
   *  check for the few items that carry one (see NavItem.allowedRoles above).
   *  Every other visibility decision is permissions-only. */
  role: UserRole;
  /** Live-resolved permission set (built-in role + any custom-role grants). Null only
   *  on a genuine resolution failure — treated as empty (fail closed), never as "show
   *  everything unfiltered". */
  permissions: string[] | null;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const permSet = new Set(permissions ?? []);

  function isVisible(item: NavItem): boolean {
    if (item.allowedRoles && !item.allowedRoles.includes(role)) return false;
    if (!item.requiredPermission) return true;
    if (Array.isArray(item.requiredPermission)) {
      return item.requiredPermission.some((p) => permSet.has(p));
    }
    return permSet.has(item.requiredPermission);
  }

  // Every section is evaluated for every user — built-in role or custom role
  // alike — and only the items they actually hold a permission for survive.
  // A section with nothing left in it is dropped entirely rather than shown
  // as an empty heading.
  const sections = NAV_SECTIONS
    .map((section) => ({ ...section, items: section.items.filter(isVisible) }))
    .filter((section) => section.items.length > 0);

  const showHelpBox = permSet.has("appeals:submit");

  // Close on Escape key — standard for modal-style overlays (WCAG 2.1 SC 2.1.2)
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col fixed left-0 top-16 bottom-0 w-64 bg-white border-r border-slate-200 z-30 overflow-y-auto">
        <SidebarContent sections={sections} pathname={pathname} showHelpBox={showHelpBox} onClose={onClose} />
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className="relative flex flex-col w-72 bg-white h-full shadow-2xl z-10 overflow-y-auto"
          >
            <div className="flex items-center justify-between px-4 h-16 border-b border-slate-200 shrink-0">
              <p className="font-bold text-slate-900" id="mobile-nav-title">Menu</p>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"
                aria-label="Close navigation"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <SidebarContent sections={sections} pathname={pathname} showHelpBox={showHelpBox} onClose={onClose} />
          </aside>
        </div>
      )}
    </>
  );
}
