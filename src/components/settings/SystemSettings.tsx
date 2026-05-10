import { db } from "@/lib/db";
import { getFileUrl } from "@/lib/storage";
import { Shield, Globe, Bell, Database, Mail, Key, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import CertificateSettings from "./CertificateSettings";

export default async function SystemSettings() {
  const [schemeCount, userCount, certCount, pendingAppeals, directorName, directorSig] = await Promise.all([
    db.certificationScheme.count({ where: { isActive: true } }),
    db.user.count({ where: { status: "ACTIVE" } }),
    db.certificate.count({ where: { status: "ACTIVE" } }),
    db.appeal.count({ where: { status: "SUBMITTED" } }),
    db.platformSetting.findUnique({ where: { key: "cert_director_name" } }),
    db.platformSetting.findUnique({ where: { key: "cert_director_signature_url" } }),
  ]);

  const smtpConfigured = !!(
    process.env.EMAIL_SERVER_HOST &&
    process.env.EMAIL_SERVER_HOST !== "localhost" &&
    process.env.EMAIL_SERVER_USER
  );
  const paystackLive = process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_live_") ?? false;
  const aiConfigured = !!(
    process.env.ANTHROPIC_API_KEY &&
    !process.env.ANTHROPIC_API_KEY.includes("YOUR_KEY")
  );
  const productionUrl = !!(
    process.env.NEXT_PUBLIC_APP_URL &&
    !process.env.NEXT_PUBLIC_APP_URL.includes("localhost")
  );
  const inngestConfigured = !!(process.env.INNGEST_SIGNING_KEY && process.env.INNGEST_EVENT_KEY);
  const sentryConfigured = !!process.env.NEXT_PUBLIC_SENTRY_DSN;
  const cloudStorageConfigured = process.env.STORAGE_PROVIDER === "s3" && !!process.env.AWS_S3_BUCKET;
  const authSecretStrong = !!(
    process.env.AUTH_SECRET &&
    !process.env.AUTH_SECRET.includes("dev-secret") &&
    process.env.AUTH_SECRET.length >= 32
  );
  const nextauthUrlSet = productionUrl && !!(
    process.env.NEXTAUTH_URL &&
    !process.env.NEXTAUTH_URL.includes("localhost")
  );

  const checklist = [
    { done: true,                 item: "PostgreSQL database connected (Neon)" },
    { done: authSecretStrong,     item: "AUTH_SECRET set to a strong random value" },
    { done: nextauthUrlSet,       item: "NEXTAUTH_URL set to production domain" },
    { done: productionUrl,        item: "NEXT_PUBLIC_APP_URL set to production domain" },
    { done: smtpConfigured,       item: "SMTP configured for transactional email" },
    { done: paystackLive,         item: "Paystack live keys active (swap from test)" },
    { done: inngestConfigured,    item: "Inngest signing + event keys set" },
    { done: cloudStorageConfigured, item: "Cloud file storage configured (S3 / R2)" },
    { done: aiConfigured,         item: "ANTHROPIC_API_KEY set for AI question generation" },
    { done: sentryConfigured,     item: "Sentry error tracking configured" },
    { done: false,                item: "Google / Microsoft OAuth (optional)" },
  ];

  const readyCount = checklist.filter((c) => c.done).length;
  const totalCount = checklist.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">System Settings</h1>
        <p className="text-slate-500 text-sm mt-1">Platform configuration and compliance settings</p>
      </div>

      {/* Live platform stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Active Schemes", value: schemeCount, color: "text-primary" },
          { label: "Active Users", value: userCount, color: "text-emerald-600" },
          { label: "Certificates Issued", value: certCount, color: "text-purple-600" },
          { label: "Pending Appeals", value: pendingAppeals, color: pendingAppeals > 0 ? "text-amber-600" : "text-slate-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-center">
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-slate-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Config sections */}
      <div className="grid gap-5 md:grid-cols-2">
        <Section
          icon={<Shield className="w-5 h-5" />}
          iconClass="text-blue-600 bg-blue-50"
          title="Security & Compliance"
          status="Configured"
          statusClass="bg-emerald-100 text-emerald-700"
          description="Password policies, MFA, session timeouts, and ISO 17024 separation-of-duties."
          items={[
            "Passwords: min 8 chars, bcrypt-hashed (cost 12)",
            "Account lockout after 5 failed attempts",
            "JWT sessions — no persistent server-side state",
            "Role-based access control (7 roles enforced)",
            "Full audit log on all sensitive actions",
          ]}
        />

        <Section
          icon={<Globe className="w-5 h-5" />}
          iconClass="text-primary bg-primary/10"
          title="Certification Schemes"
          status={`${schemeCount} Active`}
          statusClass="bg-emerald-100 text-emerald-700"
          description="ISO certification schemes, validity periods, CPD requirements, and pass marks."
          items={[
            `${schemeCount} active scheme${schemeCount !== 1 ? "s" : ""} configured`,
            "Each scheme defines pass mark, CPD hours, validity",
            "Candidate eligibility enforced per-scheme",
            "Manage via Manage → Courses & Schemes",
          ]}
          action={{ label: "Manage Schemes", href: "/manage/courses" }}
        />

        <Section
          icon={<Mail className="w-5 h-5" />}
          iconClass="text-amber-600 bg-amber-50"
          title="Email & Notifications"
          status={smtpConfigured ? "Configured" : "Needs setup"}
          statusClass={smtpConfigured ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}
          description="Transactional email via SMTP (Nodemailer). Background delivery via Inngest."
          items={[
            smtpConfigured
              ? `SMTP: ${process.env.EMAIL_SERVER_HOST}`
              : "SMTP: localhost only — set EMAIL_SERVER_* for production",
            `Sender address: ${process.env.EMAIL_FROM ?? "not set"}`,
            inngestConfigured
              ? "Inngest: production signing key active"
              : "Inngest: dev mode — set INNGEST_SIGNING_KEY for production",
            "Templates: welcome, password reset, enrolment, exam result",
          ]}
          itemStatus={(item) => {
            if (item.startsWith("SMTP:") && !smtpConfigured) return "warn";
            if (item.startsWith("Inngest:") && !inngestConfigured) return "warn";
            return "neutral";
          }}
        />

        <Section
          icon={<Database className="w-5 h-5" />}
          iconClass="text-slate-600 bg-slate-100"
          title="Data Retention"
          status="Compliant"
          statusClass="bg-emerald-100 text-emerald-700"
          description="Retention periods aligned with ISO 17024 and NDPR (Nigeria) requirements."
          items={[
            "Certification records: 7 years",
            "Exam records: 3 years",
            "Proctoring incidents: 6 months",
            "Candidate PII: 3 years post-inactivity",
          ]}
        />

        <Section
          icon={<Bell className="w-5 h-5" />}
          iconClass="text-purple-600 bg-purple-50"
          title="Certificate Renewal Warnings"
          status="Configured"
          statusClass="bg-emerald-100 text-emerald-700"
          description="Automated expiry notification schedule for certificate holders."
          items={[
            "Alert at 180 days before expiry",
            "Alert at 90 days before expiry",
            "Alert at 30 days before expiry",
            "Shown on candidate dashboard and sent by email",
          ]}
        />

        <Section
          icon={<Key className="w-5 h-5" />}
          iconClass="text-rose-600 bg-rose-50"
          title="API & Integrations"
          status={paystackLive && aiConfigured ? "All configured" : "Action needed"}
          statusClass={paystackLive && aiConfigured ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}
          description="Payment gateway, AI question generation, and OAuth providers."
          items={[
            paystackLive
              ? "Paystack: live keys active"
              : "Paystack: TEST mode — swap to live keys before go-live",
            aiConfigured
              ? "Anthropic AI: configured"
              : "Anthropic AI: ANTHROPIC_API_KEY not set — AI generation disabled",
            "Google OAuth: not configured (optional)",
            "Microsoft Entra ID: not configured (optional)",
          ]}
          itemStatus={(item) => {
            if (item.startsWith("Paystack:")) return paystackLive ? "ok" : "warn";
            if (item.startsWith("Anthropic AI:")) return aiConfigured ? "ok" : "warn";
            return "neutral";
          }}
        />
      </div>

      {/* Certificate signature settings */}
      <CertificateSettings
        initialDirectorName={directorName?.value ?? null}
        initialDirectorSigUrl={directorSig?.value ? await getFileUrl(directorSig.value) : null}
      />

      {/* Production readiness checklist */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">Production Readiness</h3>
            <p className="text-xs text-slate-500 mt-0.5">{readyCount} of {totalCount} items complete</p>
          </div>
          <span className="text-2xl font-bold text-slate-900">
            {Math.round((readyCount / totalCount) * 100)}%
          </span>
        </div>
        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${(readyCount / totalCount) * 100}%` }}
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          {checklist.map(({ done, item }) => (
            <div key={item} className="flex items-start gap-2 text-xs">
              {done
                ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                : <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />}
              <span className={done ? "text-slate-500 line-through" : "text-slate-700"}>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Reusable section card ────────────────────────────────────────────────────

function Section({
  icon,
  iconClass,
  title,
  status,
  statusClass,
  description,
  items,
  action,
  itemStatus,
}: {
  icon: React.ReactNode;
  iconClass: string;
  title: string;
  status: string;
  statusClass: string;
  description: string;
  items: string[];
  action?: { label: string; href: string };
  itemStatus?: (item: string) => "ok" | "warn" | "neutral";
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col">
      <div className="flex items-start gap-3 mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconClass}`}>
          {icon}
        </div>
        <div>
          <h3 className="font-semibold text-slate-900 text-sm">{title}</h3>
          <Badge className={`text-xs border-0 mt-1 ${statusClass}`}>{status}</Badge>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-3 leading-relaxed">{description}</p>
      <ul className="space-y-1.5 flex-1">
        {items.map((item) => {
          const s = itemStatus?.(item) ?? "neutral";
          return (
            <li key={item} className="text-xs text-slate-600 flex items-start gap-2">
              {s === "ok"      && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />}
              {s === "warn"    && <XCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />}
              {s === "neutral" && <div className="w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0 mt-1.5" />}
              <span>{item}</span>
            </li>
          );
        })}
      </ul>
      {action && (
        <Link
          href={action.href}
          className="mt-4 w-full text-center text-xs font-semibold text-primary border border-primary/30 rounded-lg py-2 hover:bg-primary/5 transition-colors"
        >
          {action.label} →
        </Link>
      )}
    </div>
  );
}
