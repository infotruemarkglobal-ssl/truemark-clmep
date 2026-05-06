import { Skeleton } from "@/components/ui/skeleton";

export default function SupportLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>

      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <Skeleton className="h-4 w-32" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-slate-50">
            <Skeleton className="h-4 w-20 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-72" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full shrink-0" />
            <Skeleton className="h-6 w-20 rounded-full shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
