import { Skeleton } from "@/components/ui/skeleton";

export default function OrgDetailLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-36" />

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-40" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-28 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-9 w-28 rounded-lg shrink-0" />
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-12" />
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <Skeleton className="h-4 w-32" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3 border-b border-slate-50">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
