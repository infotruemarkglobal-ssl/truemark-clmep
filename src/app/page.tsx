import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";

export default async function RootPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  redirect("/login");
}
