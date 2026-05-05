import { db } from "@/lib/db";

export default async function CartCount({ userId }: { userId: string }) {
  const cart = await db.cart.findUnique({
    where: { userId },
    select: { _count: { select: { items: true } } },
  });

  const count = cart?._count.items ?? 0;
  if (count === 0) return null;

  return (
    <span className="absolute top-1 right-1 min-w-[1.1rem] h-[1.1rem] bg-primary rounded-full ring-2 ring-white flex items-center justify-center text-[9px] font-bold text-white leading-none px-0.5">
      {count > 99 ? "99+" : count}
    </span>
  );
}
