import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/i18n/locales";

// No locale-prefixed routing — resolves per-request, preferring (in order):
// 1. The signed-in user's stored preference (User.locale)
// 2. The "locale" cookie set by the language switcher on public pages
// 3. DEFAULT_LOCALE
export default getRequestConfig(async () => {
  const session = await auth();
  if (session?.user?.id) {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { locale: true },
    });
    if (isSupportedLocale(user?.locale)) {
      return { locale: user.locale, messages: (await import(`../../messages/${user.locale}.json`)).default };
    }
  }

  const store = await cookies();
  const cookieLocale = store.get("locale")?.value;
  const locale = isSupportedLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
