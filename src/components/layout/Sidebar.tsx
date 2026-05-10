"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  LayoutDashboard, BookOpen, FileText, Award, Users, Building2,
  BarChart3, Shield, ShieldCheck, ClipboardList, FolderOpen, MessageSquare,
  Settings, HelpCircle, X, TrendingUp, Package, BadgeCheck, Bell,
  UserCircle, Eye, Scale, Crown, CreditCard, KeyRound, ClipboardCheck, ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/constants";

type NavItem = { label: string; href: string; icon: React.ElementType };
type NavSection = { heading?: string; items: NavItem[] };

// ── Per-role navigation maps ──────────────────────────────────────────────────

const ALL_ROLES: UserRole[] = ["SUPER_ADMIN","CERTIFICATION_OFFICER","EXAMINER","TRAINER","PROCTOR","AUDITOR","ORG_MANAGER","CANDIDATE","SUPPORT_AGENT"];

const CORE: NavSection = {
  items: [
    { label: "Dashboard",     href: "/dashboard",     icon: LayoutDashboard },
    { label: "Notifications", href: "/notifications", icon: Bell },
  ],
};

const PROFILE_SECTION: NavSection = {
  heading: "Account",
  items: [{ label: "My Profile", href: "/profile", icon: UserCircle }],
};

const ROLE_NAV: Record<UserRole, NavSection[]> = {

  CANDIDATE: [
    CORE,
    {
      heading: "Learning",
      items: [
        { label: "My Courses",    href: "/courses",      icon: BookOpen  },
        { label: "My Exams",      href: "/exams",        icon: FileText  },
        { label: "Certificates",  href: "/certificates", icon: Award     },
        { label: "CPD Log",       href: "/cpd",          icon: TrendingUp },
      ],
    },
    {
      heading: "Support",
      items: [
        { label: "My Tickets",    href: "/support",      icon: MessageSquare },
        { label: "Appeals",       href: "/appeals",      icon: Scale },
      ],
    },
    PROFILE_SECTION,
  ],

  TRAINER: [
    CORE,
    {
      heading: "Content",
      items: [
        { label: "Courses",          href: "/manage/courses", icon: BookOpen  },
        { label: "SCORM Packages",   href: "/manage/scorm",   icon: Package   },
        { label: "Document Library", href: "/documents",      icon: FolderOpen },
      ],
    },
    PROFILE_SECTION,
  ],

  EXAMINER: [
    CORE,
    {
      heading: "Exams",
      items: [
        { label: "Grade Queue",           href: "/manage/grade-queue", icon: ListChecks   },
        { label: "Exam Papers & Grading", href: "/manage/exams",       icon: ClipboardList },
        { label: "Documents",             href: "/documents",           icon: FolderOpen    },
      ],
    },
    PROFILE_SECTION,
  ],

  PROCTOR: [
    CORE,
    {
      heading: "Monitoring",
      items: [
        { label: "Live Monitoring", href: "/proctor", icon: Eye },
      ],
    },
    PROFILE_SECTION,
  ],

  ORG_MANAGER: [
    CORE,
    {
      heading: "Organisation",
      items: [
        { label: "My Organisation", href: "/organisations", icon: Building2 },
        { label: "Members & Courses", href: "/organisations/members", icon: Users },
      ],
    },
    {
      heading: "Learning",
      items: [
        { label: "Courses", href: "/courses", icon: BookOpen   },
        { label: "CPD Log", href: "/cpd",     icon: TrendingUp },
      ],
    },
    {
      heading: "Support",
      items: [
        { label: "My Tickets",  href: "/support",  icon: MessageSquare },
        { label: "Appeals",     href: "/appeals",  icon: Scale },
      ],
    },
    PROFILE_SECTION,
  ],

  AUDITOR: [
    CORE,
    {
      heading: "Compliance",
      items: [
        { label: "ISO 17024 Status", href: "/compliance",        icon: ShieldCheck   },
        { label: "Audit Programme",  href: "/audit-programme",   icon: ClipboardCheck },
        { label: "Audit Log",        href: "/audit",             icon: ClipboardList  },
        { label: "Reports",          href: "/reports",           icon: BarChart3      },
      ],
    },
    {
      heading: "Records",
      items: [
        { label: "Certificate Records", href: "/manage/certificates", icon: Award      },
        { label: "Documents",           href: "/documents",           icon: FolderOpen },
      ],
    },
    PROFILE_SECTION,
  ],

  CERTIFICATION_OFFICER: [
    CORE,
    {
      heading: "Certification",
      items: [
        { label: "Applications",        href: "/manage/applications",  icon: ClipboardList },
        { label: "Decisions",           href: "/manage/decisions",     icon: BadgeCheck    },
        { label: "Manage Certificates", href: "/manage/certificates",  icon: Award         },
        { label: "Manage Complaints",   href: "/manage/complaints",    icon: MessageSquare },
        { label: "Appeals",             href: "/appeals",              icon: Scale         },
      ],
    },
    {
      heading: "Management",
      items: [
        { label: "Courses",        href: "/manage/courses", icon: BookOpen      },
        { label: "Exam Papers",    href: "/manage/exams",   icon: ClipboardList },
        { label: "Organisations",  href: "/organisations",  icon: Building2     },
        { label: "Reports",        href: "/reports",        icon: BarChart3     },
        { label: "Documents",      href: "/documents",      icon: FolderOpen    },
      ],
    },
    PROFILE_SECTION,
  ],

  SUPER_ADMIN: [
    CORE,
    {
      heading: "Owner Panel",
      items: [
        { label: "Platform Overview",  href: "/platform",                icon: Crown      },
        { label: "Organisations",      href: "/platform/organisations",  icon: Building2  },
        { label: "All Users",          href: "/platform/users",          icon: Users      },
        { label: "Payments",           href: "/platform/payments",       icon: CreditCard },
        { label: "Registrations",      href: "/platform/registrations",  icon: BookOpen   },
        { label: "Permissions",        href: "/platform/permissions",    icon: KeyRound   },
      ],
    },
    {
      heading: "Operations",
      items: [
        { label: "Courses",               href: "/manage/courses",       icon: BookOpen      },
        { label: "Exam Papers",           href: "/manage/exams",         icon: ClipboardList },
        { label: "SCORM Packages",        href: "/manage/scorm",         icon: Package       },
        { label: "Applications",          href: "/manage/applications",  icon: ClipboardList },
        { label: "Certification Decisions", href: "/manage/decisions",   icon: BadgeCheck    },
        { label: "Manage Certificates",   href: "/manage/certificates",  icon: Award         },
        { label: "Certification Schemes", href: "/manage/schemes",       icon: Shield        },
        { label: "Manage Complaints",     href: "/manage/complaints",    icon: MessageSquare },
        { label: "Appeals",               href: "/appeals",              icon: Scale         },
        { label: "Support Queue",         href: "/support",              icon: MessageSquare },
      ],
    },
    {
      heading: "People & Organisations",
      items: [
        { label: "Staff", href: "/staff", icon: Users },
      ],
    },
    {
      heading: "Compliance & Data",
      items: [
        { label: "ISO 17024 Status",   href: "/compliance",       icon: ShieldCheck    },
        { label: "Management Review",  href: "/manage/review",    icon: FileText       },
        { label: "Audit Programme",    href: "/audit-programme",  icon: ClipboardCheck },
        { label: "Audit Log",          href: "/audit",            icon: ClipboardList  },
        { label: "Reports",            href: "/reports",          icon: BarChart3      },
        { label: "Documents",          href: "/documents",        icon: FolderOpen     },
      ],
    },
    {
      heading: "System",
      items: [
        { label: "Settings", href: "/settings", icon: Settings },
      ],
    },
    PROFILE_SECTION,
  ],
  SUPPORT_AGENT: [
    CORE,
    {
      heading: "Support",
      items: [
        { label: "Support Queue", href: "/support", icon: MessageSquare },
      ],
    },
    {
      heading: "Users & Orgs",
      items: [
        { label: "User Lookup",   href: "/platform/users", icon: Users     },
        { label: "Organisations", href: "/organisations",  icon: Building2 },
      ],
    },
    PROFILE_SECTION,
  ],
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function Sidebar({
  role,
  open,
  onClose,
}: {
  role: UserRole;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const sections = ROLE_NAV[role] ?? ROLE_NAV.CANDIDATE;

  // Close on Escape key — standard for modal-style overlays (WCAG 2.1 SC 2.1.2)
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const SidebarContent = () => (
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

      {/* Help box — candidates and org managers */}
      {(role === "CANDIDATE" || role === "ORG_MANAGER") && (
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

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col fixed left-0 top-16 bottom-0 w-64 bg-white border-r border-slate-200 z-30 overflow-y-auto">
        <SidebarContent />
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
            <SidebarContent />
          </aside>
        </div>
      )}
    </>
  );
}
