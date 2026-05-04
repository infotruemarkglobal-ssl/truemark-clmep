import { redirect } from "next/navigation";

// /manage/users → /staff (same page, different URL entry point)
export default function Page() {
  redirect("/staff");
}
