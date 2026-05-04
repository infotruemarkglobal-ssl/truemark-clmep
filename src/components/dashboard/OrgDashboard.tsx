import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Users, Award, TrendingUp, BookOpen, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default async function OrgDashboard() {
  const session = await auth();
  const userId = session!.user.id;
  const firstName = session!.user.name?.split(" ")[0] ?? "there";

  // Find the organisation this manager belongs to
  const membership = await db.organisationMember.findFirst({
    where: { userId },
    select: { organisationId: true },
  });

  const orgId = membership?.organisationId;

  const [memberCount, enrolmentCount, certCount, enrolments] = await Promise.all([
    orgId
      ? db.organisationMember.count({ where: { organisationId: orgId } })
      : Promise.resolve(0),

    orgId
      ? db.enrolment.count({
          where: {
            status: "ACTIVE",
            user: { organisationMemberships: { some: { organisationId: orgId } } },
          },
        })
      : Promise.resolve(0),

    orgId
      ? db.certificate.count({
          where: {
            status: "ACTIVE",
            user: { organisationMemberships: { some: { organisationId: orgId } } },
          },
        })
      : Promise.resolve(0),

    orgId
      ? db.enrolment.findMany({
          where: {
            status: "ACTIVE",
            user: { organisationMemberships: { some: { organisationId: orgId } } },
          },
          select: { progress: true },
        })
      : Promise.resolve([]),
  ]);

  const avgCompletion =
    enrolments.length > 0
      ? Math.round(enrolments.reduce((sum, e) => sum + e.progress, 0) / enrolments.length)
      : 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Organisation Overview</h1>
        <p className="text-slate-500 mt-1">Welcome back, {firstName}. Manage your team&apos;s training and certifications.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Staff Members", value: memberCount, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Active Enrolments", value: enrolmentCount, icon: BookOpen, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Certifications Held", value: certCount, icon: Award, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "Avg Completion", value: `${avgCompletion}%`, icon: TrendingUp, color: "text-orange-600", bg: "bg-orange-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center shrink-0`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{value}</p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {[
          { title: "Manage Staff", desc: "Add, remove and assign roles to your team members.", href: "/organisations/members", icon: Users },
          { title: "Course Catalogue", desc: "Browse and purchase courses for your organisation.", href: "/courses", icon: BookOpen },
          { title: "Compliance Report", desc: "View certification compliance status across your teams.", href: "/reports", icon: TrendingUp },
        ].map(({ title, desc, href, icon: Icon }) => (
          <Link key={href} href={href}>
            <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer group h-full">
              <CardHeader className="pb-2">
                <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center mb-2 group-hover:bg-primary/10 transition-colors">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <CardTitle className="text-sm font-semibold group-hover:text-primary transition-colors flex items-center gap-2">
                  {title} <ChevronRight className="w-3 h-3 ml-auto" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-slate-500">{desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
