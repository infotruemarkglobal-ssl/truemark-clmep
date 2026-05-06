import { Skeleton } from "@/components/ui/skeleton";

export default function ProctorLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full shrink-0" />
            </div>
            <Skeleton className="h-3 w-40" />
            <div className="space-y-2">
              <Skeleton className="h-3 w-24" />
              {Array.from({ length: 2 }).map((_, j) => (
                <div key={j} className="flex items-center justify-between gap-2">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-4 w-16 rounded-full" />
                </div>
              ))}
            </div>
            <div className="pt-1 border-t border-slate-100">
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
