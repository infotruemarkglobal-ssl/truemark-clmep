import { Skeleton } from "@/components/ui/skeleton";

export default function PlatformUserDetailLoading() {
  return (
    <div className="space-y-5 max-w-2xl">
      <Skeleton className="h-4 w-32" />

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-56" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <Skeleton className="h-4 w-36" />
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-2">
              <Skeleton className="h-4 w-28 shrink-0" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
        <Skeleton className="h-4 w-48" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-2.5 border-t border-slate-100">
            <div className="space-y-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
