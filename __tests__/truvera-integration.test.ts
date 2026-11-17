/**
 * The read link to Truvera: authentication by one shared secret, paging, and what leaves CLMEP.
 * No database: `@/lib/db` and the rate limiter are mocked, so this never touches a real database.
 */
import { NextRequest } from "next/server";

const findMany = jest.fn();
jest.mock("@/lib/db", () => ({ db: { certificate: { findMany: (...a: unknown[]) => findMany(...a) } } }));
const rateLimit = jest.fn();
jest.mock("@/lib/rate-limit", () => ({
  rateLimit: (...a: unknown[]) => rateLimit(...a),
  getClientIp: () => "203.0.113.9",
}));

import { GET } from "@/app/api/v1/body/certificates/route";
import { clampLimit, requireTruveraKey, toBodyCertificate, type CertificateRow } from "@/lib/truvera-integration";

const KEY = "k".repeat(40);
const URL_ = "http://localhost/api/v1/body/certificates";
const req = (path = "", headers: Record<string, string> = { authorization: `Bearer ${KEY}` }) => new NextRequest(`${URL_}${path}`, { headers });

const row = (over: Partial<CertificateRow> = {}): CertificateRow => ({
  id: "c1",
  certificateNumber: "TM-2026-0001",
  status: "ACTIVE",
  issuedAt: new Date("2026-01-10T00:00:00Z"),
  expiresAt: new Date("2029-01-10T00:00:00Z"),
  revokedAt: null,
  standardVersion: "ISO/IEC 17024:2012",
  schemeCodeSnapshot: "CLA",
  schemeNameSnapshot: "Certified Lead Auditor",
  scheme: { code: "CLA-RENAMED", name: "Renamed Later" },
  user: { firstName: "Ngozi", lastName: "Okeke", profile: { country: "NG" } },
  ...over,
});

beforeEach(() => {
  process.env.TRUVERA_INTEGRATION_KEY = KEY;
  findMany.mockReset();
  rateLimit.mockReset();
  rateLimit.mockResolvedValue({ success: true });
});
afterAll(() => { delete process.env.TRUVERA_INTEGRATION_KEY; });

describe("authentication", () => {
  it("is off until the owner sets a key of at least 32 characters", async () => {
    delete process.env.TRUVERA_INTEGRATION_KEY;
    expect((await GET(req())).status).toBe(503);
    process.env.TRUVERA_INTEGRATION_KEY = "too-short";
    expect((await GET(req())).status).toBe(503);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("refuses a missing or wrong key without reading anything", async () => {
    expect((await GET(req("", {}))).status).toBe(401);
    expect((await GET(req("", { authorization: "Bearer wrong" }))).status).toBe(401);
    expect((await GET(req("", { authorization: `Basic ${KEY}` }))).status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("is rate limited, and the limit is checked before the key is compared", async () => {
    rateLimit.mockResolvedValue({ success: false });
    expect((await GET(req())).status).toBe(429);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("accepts the right key", async () => {
    expect(await requireTruveraKey(req())).toEqual({ ok: true });
  });
});

describe("what leaves CLMEP", () => {
  it("is the certificate and the holder's name and country, never an email, reason or ID detail", async () => {
    const leaky = { ...row(), revocationReason: "Exam misconduct", user: { ...row().user, email: "n@x.test", dateOfBirth: "1990-01-01" } };
    findMany.mockResolvedValue([leaky]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("n@x.test");
    expect(text).not.toContain("misconduct");
    expect(text).not.toContain("1990");
    expect(text).toContain("Ngozi Okeke");
    expect(text).toContain("TM-2026-0001");
  });

  it("uses the scheme name as it was at issue, not as it is renamed later", () => {
    const c = toBodyCertificate(row());
    expect(c).toMatchObject({ schemeCode: "CLA", schemeName: "Certified Lead Auditor", holder: { name: "Ngozi Okeke", country: "NG" } });
    expect(toBodyCertificate(row({ schemeCodeSnapshot: null, schemeNameSnapshot: null })).schemeCode).toBe("CLA-RENAMED");
  });

  it("says whether it is valid today: only ACTIVE and not past its expiry", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    expect(toBodyCertificate(row(), now).validNow).toBe(true);
    expect(toBodyCertificate(row({ expiresAt: new Date("2026-05-31T00:00:00Z") }), now)).toMatchObject({ status: "ACTIVE", validNow: false });
    expect(toBodyCertificate(row({ status: "SUSPENDED" }), now).validNow).toBe(false);
    expect(toBodyCertificate(row({ status: "REVOKED", revokedAt: new Date("2026-05-01T00:00:00Z") }), now)).toMatchObject({ validNow: false, revokedAt: "2026-05-01T00:00:00.000Z" });
    expect(toBodyCertificate(row({ expiresAt: null }), now).validNow).toBe(true);
  });

  it("copes with a holder who has no profile", () => {
    expect(toBodyCertificate(row({ user: { firstName: "A", lastName: "B", profile: null } })).holder).toEqual({ name: "A B", country: null });
  });
});

describe("paging", () => {
  it("clamps the page size", () => {
    expect(clampLimit(null)).toBe(100);
    expect(clampLimit("0")).toBe(100);
    expect(clampLimit("abc")).toBe(100);
    expect(clampLimit("5")).toBe(5);
    expect(clampLimit("100000")).toBe(200);
  });

  it("asks for one more than the page to know whether there is a next page, and returns the cursor", async () => {
    findMany.mockResolvedValue([row({ id: "a" }), row({ id: "b" }), row({ id: "c" })]);
    const body = await (await GET(req("?limit=2"))).json();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3, orderBy: { id: "asc" }, where: { deletedAt: null } }));
    expect(body.data.map((c: { id: string }) => c.id)).toEqual(["a", "b"]);
    expect(body.nextCursor).toBe("b");
  });

  it("continues after the cursor and ends with a null cursor", async () => {
    findMany.mockResolvedValue([row({ id: "c" })]);
    const body = await (await GET(req("?limit=2&cursor=b"))).json();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ cursor: { id: "b" }, skip: 1 }));
    expect(body).toMatchObject({ nextCursor: null });
    expect(body.data).toHaveLength(1);
  });
});
