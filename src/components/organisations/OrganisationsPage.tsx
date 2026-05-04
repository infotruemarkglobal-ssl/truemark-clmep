"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { Building2, Plus, Search, Users, ShoppingBag, Globe, CheckCircle2, XCircle, MoreHorizontal, ChevronRight, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Org = {
  id: string;
  name: string;
  registrationNo: string | null;
  country: string | null;
  website: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { members: number; purchases: number };
};

const EMPTY_FORM = {
  name: "", registrationNo: "", country: "", website: "",
  managerFirstName: "", managerLastName: "", managerEmail: "",
};

export default function OrganisationsPage({ organisations, isSuperAdmin }: { organisations: Org[]; isSuperAdmin: boolean }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const filtered = organisations.filter((o) =>
    !search || o.name.toLowerCase().includes(search.toLowerCase()) || (o.country ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const hasManager = form.managerFirstName || form.managerLastName || form.managerEmail;

  async function createOrg() {
    if (!form.name) { toast.error("Organisation name is required"); return; }
    if (hasManager && (!form.managerFirstName || !form.managerLastName || !form.managerEmail)) {
      toast.error("Please fill in all manager fields or leave them all blank");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, string> = {
        name: form.name,
        registrationNo: form.registrationNo,
        country: form.country,
        website: form.website,
      };
      if (hasManager) {
        body.managerFirstName = form.managerFirstName;
        body.managerLastName = form.managerLastName;
        body.managerEmail = form.managerEmail;
      }
      const res = await fetch("/api/organisations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success(hasManager
        ? "Organisation created and welcome email sent to manager"
        : "Organisation created");
      setShowModal(false);
      setForm(EMPTY_FORM);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    try {
      const res = await fetch(`/api/organisations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(isActive ? "Organisation deactivated" : "Organisation activated");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
    setOpenMenuId(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Organisations</h1>
          <p className="text-slate-500 text-sm mt-1">{organisations.length} registered organisations</p>
        </div>
        {isSuperAdmin && (
          <Button onClick={() => setShowModal(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Add Organisation
          </Button>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
        <Input placeholder="Search organisations…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.length === 0 ? (
          <div className="col-span-3 bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-200" />
            <p className="text-slate-500">No organisations found</p>
          </div>
        ) : (
          filtered.map((org) => (
            <div key={org.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 relative">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={cn("border-0 text-xs", org.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                    {org.isActive ? "Active" : "Inactive"}
                  </Badge>
                  {isSuperAdmin && (
                    <div className="relative">
                      <button onClick={() => setOpenMenuId(openMenuId === org.id ? null : org.id)} className="p-1 rounded hover:bg-slate-100 text-slate-400">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {openMenuId === org.id && (
                        <div className="absolute right-0 top-6 bg-white border border-slate-200 rounded-xl shadow-lg z-10 py-1 min-w-36">
                          <button onClick={() => toggleActive(org.id, org.isActive)} className={cn("w-full text-left px-3 py-2 text-sm flex items-center gap-2", org.isActive ? "text-red-600 hover:bg-red-50" : "text-emerald-600 hover:bg-emerald-50")}>
                            {org.isActive ? <><XCircle className="w-3.5 h-3.5" /> Deactivate</> : <><CheckCircle2 className="w-3.5 h-3.5" /> Activate</>}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <h3 className="font-semibold text-slate-900 mb-0.5">{org.name}</h3>
              {org.registrationNo && <p className="text-xs text-slate-500">Reg: {org.registrationNo}</p>}
              {org.country && <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><Globe className="w-3 h-3" /> {org.country}</p>}
              <div className="flex gap-4 mt-4 pt-4 border-t border-slate-100 text-sm">
                <div className="flex items-center gap-1.5 text-slate-600">
                  <Users className="w-4 h-4 text-slate-400" />
                  <span className="font-semibold">{org._count.members}</span> members
                </div>
                <div className="flex items-center gap-1.5 text-slate-600">
                  <ShoppingBag className="w-4 h-4 text-slate-400" />
                  <span className="font-semibold">{org._count.purchases}</span> purchases
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-2">Added {format(new Date(org.createdAt), "d MMM yyyy")}</p>
              <button
                onClick={() => router.push(`/organisations/${org.id}`)}
                className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition border border-primary/20 rounded-lg py-1.5 hover:bg-primary/5"
              >
                Manage <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl my-4">
            <h3 className="font-bold text-slate-900 text-lg mb-5">Add Organisation</h3>

            {/* Org details */}
            <div className="space-y-3">
              <div><Label>Organisation Name *</Label><Input className="mt-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
              <div><Label>Registration Number</Label><Input className="mt-1" value={form.registrationNo} onChange={(e) => setForm((f) => ({ ...f, registrationNo: e.target.value }))} /></div>
              <div><Label>Country</Label><Input className="mt-1" value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} /></div>
              <div><Label>Website</Label><Input type="url" className="mt-1" placeholder="https://" value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} /></div>
            </div>

            {/* Org Manager — optional */}
            <div className="mt-5 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2 mb-3">
                <UserPlus className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-semibold text-slate-700">Org Manager Account</span>
                <span className="text-xs text-slate-400 ml-1">(optional — can be added later)</span>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>First Name</Label><Input className="mt-1" value={form.managerFirstName} onChange={(e) => setForm((f) => ({ ...f, managerFirstName: e.target.value }))} /></div>
                  <div><Label>Last Name</Label><Input className="mt-1" value={form.managerLastName} onChange={(e) => setForm((f) => ({ ...f, managerLastName: e.target.value }))} /></div>
                </div>
                <div><Label>Email Address</Label><Input type="email" className="mt-1" placeholder="manager@company.com" value={form.managerEmail} onChange={(e) => setForm((f) => ({ ...f, managerEmail: e.target.value }))} /></div>
              </div>
              {hasManager && (
                <p className="text-xs text-blue-600 mt-2 bg-blue-50 rounded-lg px-3 py-2">
                  A temporary password will be generated and emailed to the manager. They must change it on first login.
                </p>
              )}
            </div>

            <div className="flex gap-3 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => { setShowModal(false); setForm(EMPTY_FORM); }}>Cancel</Button>
              <Button className="flex-1" onClick={createOrg} disabled={saving}>{saving ? "Creating…" : "Create"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
