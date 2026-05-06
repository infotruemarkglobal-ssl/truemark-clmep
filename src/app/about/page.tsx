import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import {
  Shield, Award, Scale, Users, Globe, FileText,
  CheckCircle2, ExternalLink, Mail, Building2,
} from "lucide-react";

export const metadata: Metadata = {
  title: "About TrueMark Global — ISO/IEC 17024 Certification Body",
  description:
    "TrueMark Global Standards and Solutions Limited is an accredited certification body " +
    "operating under ISO/IEC 17024:2012. Learn about our structure, scope, and commitment to impartiality.",
};

export const dynamic = "force-dynamic";

const COMMITTEES = [
  {
    icon: Building2,
    title: "Board of Directors",
    description:
      "The Board holds overall accountability for the certification body. Directors are appointed " +
      "for their expertise in standards, regulation, and professional development. The Board reviews " +
      "and approves all major policies affecting impartiality and certification integrity.",
  },
  {
    icon: FileText,
    title: "Technical Committee",
    description:
      "The Technical Committee oversees scheme design, examination integrity, and competency standards. " +
      "It is composed of subject-matter experts and independent industry practitioners who ensure " +
      "that all assessment criteria remain current, valid, and relevant.",
  },
  {
    icon: Scale,
    title: "Appeals Committee",
    description:
      "The Appeals Committee is an independent panel that reviews candidate appeals against " +
      "certification decisions. All members are free from conflicts of interest in the case under " +
      "review. Decisions are binding and documented in accordance with ISO 17024 Cl.7.9.",
  },
  {
    icon: Shield,
    title: "Impartiality Committee",
    description:
      "The Impartiality Committee monitors and safeguards the objectivity of all certification " +
      "activities. It reviews conflict-of-interest declarations, conducts periodic impartiality " +
      "risk assessments, and reports directly to the Board. Membership includes stakeholders " +
      "external to TrueMark Global to maintain independence.",
  },
];

const IMPARTIALITY_POINTS = [
  "All personnel involved in certification decisions declare conflicts of interest annually and for each specific case.",
  "Examination marking is anonymised; examiners do not have access to candidate identity during grading.",
  "No commercial relationships are permitted that could compromise the objectivity of a certification decision.",
  "Appeals are handled by a panel independent of the original decision-makers.",
  "The Impartiality Committee meets quarterly and reports its findings to the Board.",
  "Certification decisions are made solely on the basis of objective evidence against defined competency criteria.",
];

export default async function AboutPage() {
  const [schemes, directorNameSetting] = await Promise.all([
    db.certificationScheme.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true, description: true },
      orderBy: { name: "asc" },
    }),
    db.platformSetting.findUnique({ where: { key: "cert_director_name" } }),
  ]);

  const directorName = directorNameSetting?.value ?? "Chief Executive Officer";
  const contactEmail = process.env.GDPR_DPO_EMAIL ?? "info@truemarkglobal.com";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Public navigation bar */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/about" className="flex items-center gap-2 font-bold text-slate-900 text-sm">
            <Shield className="w-5 h-5 text-primary" />
            TrueMark Global
          </Link>
          <div className="flex items-center gap-1 sm:gap-2 text-sm">
            <Link href="/about" className="px-3 py-1.5 rounded-lg text-primary font-medium bg-primary/5">
              About
            </Link>
            <Link href="/registry" className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors">
              Certificate Register
            </Link>
            <Link href="/verify/TG-2025-00000000" className="hidden sm:block px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors">
              Verify a Certificate
            </Link>
            <Link
              href="/login"
              className="px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
          <div className="flex items-start gap-6">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-2">
                ISO/IEC 17024:2012 Accredited Certification Body
              </p>
              <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight">
                TrueMark Global Standards<br className="hidden sm:block" /> and Solutions Limited
              </h1>
              <p className="mt-4 text-slate-600 max-w-2xl leading-relaxed">
                We are an independent accredited certification body committed to the highest standards
                of personnel certification. Our programmes are designed, administered, and maintained
                in full conformity with ISO/IEC 17024:2012 — the internationally recognised standard
                for certification bodies operating personnel certification schemes.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ISO/IEC 17024:2012 Accredited
                </div>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800 font-medium">
                  <Globe className="w-4 h-4 text-blue-600" />
                  Internationally Recognised
                </div>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 font-medium">
                  <Award className="w-4 h-4 text-slate-500" />
                  {schemes.length} Active Certification Scheme{schemes.length !== 1 ? "s" : ""}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-16">

        {/* Mission */}
        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-4">Our Mission</h2>
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
            <p className="text-slate-700 leading-relaxed text-lg italic border-l-4 border-primary pl-5">
              To advance professional excellence by operating a rigorous, impartial, and internationally
              credible personnel certification system — empowering individuals to demonstrate their
              competence and enabling organisations to build trust with confidence.
            </p>
            <div className="mt-6 grid sm:grid-cols-3 gap-4 text-sm">
              {[
                { icon: Shield, label: "Independence", text: "Decisions made solely on objective evidence, free from commercial or political pressure." },
                { icon: CheckCircle2, label: "Rigour", text: "Assessments designed by subject-matter experts and validated against international standards." },
                { icon: Globe, label: "Accessibility", text: "Certification pathways open to all qualified candidates regardless of prior affiliation." },
              ].map(({ icon: Icon, label, text }) => (
                <div key={label} className="flex gap-3">
                  <Icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-slate-900">{label}</p>
                    <p className="text-slate-500 mt-0.5">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Certification Body Structure */}
        <section>
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">Certification Body Structure</h2>
            <p className="text-slate-500 text-sm mt-1">
              ISO/IEC 17024:2012 Cl.5.1 requires that the certification body has a defined organisational
              structure that safeguards impartiality and ensures the integrity of certification activities.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {COMMITTEES.map(({ icon: Icon, title, description }) => (
              <div key={title} className="bg-white rounded-2xl border border-slate-200 p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-slate-900">{title}</h3>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
                {title === "Board of Directors" && directorName && (
                  <p className="mt-3 text-xs text-slate-400">
                    Authorised signatory: <span className="font-medium text-slate-600">{directorName}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Scope of Certification */}
        <section>
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">Scope of Certification</h2>
            <p className="text-slate-500 text-sm mt-1">
              TrueMark Global currently operates the following active personnel certification schemes
              under ISO/IEC 17024:2012.
            </p>
          </div>
          {schemes.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <Award className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500 text-sm">No active schemes at this time.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {schemes.map((scheme) => (
                <div key={scheme.id} className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Award className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900">{scheme.name}</span>
                      <span className="font-mono text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                        {scheme.code}
                      </span>
                    </div>
                    {scheme.description && (
                      <p className="text-sm text-slate-500 mt-1">{scheme.description}</p>
                    )}
                  </div>
                  <Link
                    href="/registry"
                    className="text-xs text-primary hover:underline shrink-0 font-medium"
                  >
                    View holders →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Commitment to Impartiality */}
        <section>
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">Our Commitment to Impartiality</h2>
            <p className="text-slate-500 text-sm mt-1">
              ISO/IEC 17024:2012 Cl.4.1–4.2 requires that certification bodies maintain and
              demonstrate impartiality in all their activities.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
            <ul className="space-y-3">
              {IMPARTIALITY_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm text-slate-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 p-4 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800">
              <strong>Impartiality Policy:</strong> TrueMark Global&apos;s Impartiality Policy and associated
              procedures are reviewed annually by the Impartiality Committee and approved by the Board
              of Directors. Stakeholders who wish to raise concerns about impartiality may do so
              confidentially by contacting the Impartiality Committee directly at{" "}
              <a href={`mailto:${contactEmail}`} className="underline font-medium">{contactEmail}</a>.
            </div>
          </div>
        </section>

        {/* Contact & Links */}
        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-6">Contact &amp; Public Services</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {/* Contact info */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Mail className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-slate-900">Get in Touch</h3>
              </div>
              <div className="space-y-3 text-sm text-slate-600">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-0.5">General Enquiries</p>
                  <a href={`mailto:${contactEmail}`} className="text-primary hover:underline">{contactEmail}</a>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-0.5">Certificate Verification</p>
                  <p>Use the <Link href="/registry" className="text-primary hover:underline">Certificate Register</Link>{" "}
                    or <Link href="/verify/example" className="text-primary hover:underline">Verify a Certificate</Link> directly.</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-0.5">Complaints</p>
                  <p>
                    Registered candidates may{" "}
                    <Link href="/register" className="text-primary hover:underline">create an account</Link>{" "}
                    to submit a complaint through our online portal.
                  </p>
                </div>
              </div>
            </div>

            {/* Public service links */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Globe className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-slate-900">Public Services</h3>
              </div>
              <div className="space-y-3">
                {[
                  {
                    href: "/registry",
                    icon: Users,
                    label: "Certificate Register",
                    desc: "Search all active certificates (ISO 17024 Cl.6.7)",
                  },
                  {
                    href: "/verify/TG-2025-00000000",
                    icon: CheckCircle2,
                    label: "Verify a Certificate",
                    desc: "Instantly confirm a certificate number",
                  },
                  {
                    href: "/register",
                    icon: FileText,
                    label: "Candidate Portal",
                    desc: "Register to apply for certification",
                    external: false,
                  },
                ].map(({ href, icon: Icon, label, desc }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group"
                  >
                    <Icon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 group-hover:text-primary transition-colors flex items-center gap-1">
                        {label} <ExternalLink className="w-3 h-3 opacity-50" />
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white mt-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-slate-900 text-sm">
                TrueMark Global Standards and Solutions Limited
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Accredited Certification Body · ISO/IEC 17024:2012
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <Link href="/registry" className="hover:text-slate-700 transition-colors">Certificate Register</Link>
              <Link href="/about" className="hover:text-slate-700 transition-colors">About</Link>
              <Link href="/login" className="hover:text-slate-700 transition-colors">Candidate Login</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
