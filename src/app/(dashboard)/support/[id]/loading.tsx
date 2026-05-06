import { Skeleton } from "@/components/ui/skeleton";

export default function SupportTicketLoading() {
  return (
    <div className="space-y-5 max-w-3xl">
      <Skeleton className="h-4 w-28" />

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-6 w-80" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-8 w-28 rounded-lg shrink-0" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <Skeleton className="h-4 w-24" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`flex gap-3 ${i % 2 === 1 ? "flex-row-reverse" : ""}`}>
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="space-y-1.5 flex-1 max-w-lg">
              <Skeleton className="h-3 w-32" />
              <div className="rounded-xl p-3 border border-slate-100 space-y-1.5">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
    </div>
  );
}
