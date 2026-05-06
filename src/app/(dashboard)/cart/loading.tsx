import { Skeleton } from "@/components/ui/skeleton";

export default function CartLoading() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-3 w-32" />
              </div>
              <div className="text-right space-y-2 shrink-0">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-6 w-6 rounded ml-auto" />
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 h-fit">
          <Skeleton className="h-5 w-32" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
          <div className="border-t pt-3 flex justify-between">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
