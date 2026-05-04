/**
 * Integration tests — User profile (GET/PATCH /api/users/me)
 *                  and password change (POST /api/profile/change-password)
 *
 * Coverage:
 *  a. GET  — unauthorized → 401
 *  b. GET  — returns own profile with candidateProfile join
 *  c. PATCH /api/users/me — unauthorized → 401
 *  d. PATCH /api/users/me — invalid body → 400
 *  e. PATCH /api/users/me — updates name, phone, and candidateProfile fields
 *  f. PATCH /api/users/me — subsequent PATCH merges profile (upsert)
 *  g. POST /api/profile/change-password — unauthorized → 401
 *  h. POST /api/profile/change-password — invalid body → 400
 *  i. POST /api/profile/change-password — wrong current password → 400
 *  j. POST /api/profile/change-password — mismatched confirmPassword → 400
 *  k. POST /api/profile/change-password — happy path sets new hash + mustChangePassword=false
 *  l. POST /api/profile/change-password — mustChangePassword=true (forced) skips current password check
 *  m. POST /api/profile/change-password — missing currentPassword when required → 400
 */

jest.mock("@/lib/db", () => {
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  require("dotenv").config();
  const url =
    process.env.TEST_DATABASE_URL ??
    process.env.DIRECT_URL ??
    process.env.DATABASE_URL ??
    "";
  const adapter = new PrismaPg({ connectionString: url });
  return { db: new PrismaClient({ adapter }) };
});

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/audit", () => ({ auditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/rate-limit", () => ({
  rateLimit: jest.fn().mockResolvedValue({ success: true, retryAfterSecs: 0 }),
}));

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { GET as meGET, PATCH as mePATCH } from "@/app/api/users/me/route";
import { POST as changePwdPOST } from "@/app/api/profile/change-password/route";

const mockAuth = auth as jest.MockedFunction<typeof auth>;

const cleanup = { userIds: [] as string[] };

function makeSession(userId: string, role = "CANDIDATE") {
  return {
    user: {
      id: userId,
      email: `${userId}@profile.test`,
      name: "Test",
      role,
      mfaEnabled: false,
      mfaVerified: true,
      mustChangePassword: false,
    },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };
}

async function mkUser(tag: string, opts: { mustChangePassword?: boolean; passwordHash?: string } = {}) {
  const u = await db.user.create({
    data: {
      email: `${tag.toLowerCase().replace(/\s/g, "-")}-${Date.now()}@profile.test`,
      firstName: tag,
      lastName: "Test",
      role: "CANDIDATE",
      status: "ACTIVE",
      mustChangePassword: opts.mustChangePassword ?? false,
      passwordHash: opts.passwordHash ?? null,
    },
  });
  cleanup.userIds.push(u.id);
  return u;
}

function patchMeReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/users/me", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function changePwdReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/profile/change-password", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

afterAll(async () => {
  await db.candidateProfile.deleteMany({ where: { userId: { in: cleanup.userIds } } });
  await db.auditLog.deleteMany({ where: { userId: { in: cleanup.userIds } } });
  await db.user.deleteMany({ where: { id: { in: cleanup.userIds } } });
  await (db as unknown as { $disconnect: () => Promise<void> }).$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
// a. GET — unauthorized
// ─────────────────────────────────────────────────────────────────────────────
describe("a. GET /api/users/me — unauthorized returns 401", () => {
  it("returns 401 with no session", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await meGET();
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// b. GET — own profile
// ─────────────────────────────────────────────────────────────────────────────
describe("b. GET /api/users/me — returns own profile", () => {
  let userId: string;

  beforeAll(async () => {
    const u = await mkUser("GetMeUser");
    userId = u.id;
    await db.candidateProfile.create({
      data: {
        userId,
        professionalTitle: "Software Engineer",
        employer: "Truemark",
        country: "NG",
        linkedinUrl: "https://linkedin.com/in/getmeuser",
      },
    });
  });

  it("returns 200 with user and nested profile", async () => {
    mockAuth.mockResolvedValue(makeSession(userId) as never);
    const res = await meGET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe(userId);
    expect(json.firstName).toBe("GetMeUser");
    expect(json.profile).toBeDefined();
    expect(json.profile.professionalTitle).toBe("Software Engineer");
    expect(json.profile.employer).toBe("Truemark");
    expect(json.profile.country).toBe("NG");
  });

  it("does not expose passwordHash", async () => {
    mockAuth.mockResolvedValue(makeSession(userId) as never);
    const res = await meGET();
    const json = await res.json();
    expect(json.passwordHash).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// c. PATCH — unauthorized
// ─────────────────────────────────────────────────────────────────────────────
describe("c. PATCH /api/users/me — unauthorized returns 401", () => {
  it("returns 401 with no session", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await mePATCH(patchMeReq({ firstName: "Alice" }));
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// d. PATCH — invalid body
// ─────────────────────────────────────────────────────────────────────────────
describe("d. PATCH /api/users/me — invalid body returns 400", () => {
  let userId: string;
  beforeAll(async () => { const u = await mkUser("PatchBadUser"); userId = u.id; });

  it("returns 400 for invalid linkedinUrl", async () => {
    mockAuth.mockResolvedValue(makeSession(userId) as never);
    const res = await mePATCH(patchMeReq({ linkedinUrl: "not-a-url" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when firstName too short", async () => {
    mockAuth.mockResolvedValue(makeSession(userId) as never);
    const res = await mePATCH(patchMeReq({ firstName: "X" }));
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// e. PATCH — updates user and candidateProfile
// ─────────────────────────────────────────────────────────────────────────────
describe("e. PATCH /api/users/me — updates name, phone, and profile fields", () => {
  let userId: string;

  beforeAll(async () => { const u = await mkUser("PatchMeUser"); userId = u.id; });

  it("returns 200 { ok: true }", async () => {
    mockAuth.mockResolvedValue(makeSession(userId) as never);
    const res = await mePATCH(patchMeReq({
      firstName: "Updated",
      lastName: "Name",
      phone: "+44-7700-900000",
      professionalTitle: "Lead Assessor",
      employer: "Acme Corp",
      country: "GB",
      linkedinUrl: "https://linkedin.com/in/updatedname",
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("user record reflects updated firstName and phone", async () => {
    const user = await db.user.findUnique({ where: { id: userId } });
    expect(user!.firstName).toBe("Updated");
    expect(user!.lastName).toBe("Name");
    expect(user!.phone).toBe("+44-7700-900000");
  });

  it("candidateProfile reflects updated fields", async () => {
    const profile = await db.candidateProfile.findUnique({ where: { userId } });
    expect(profile).not.toBeNull();
    expect(profile!.professionalTitle).toBe("Lead Assessor");
    expect(profile!.employer).toBe("Acme Corp");
    expect(profile!.country).toBe("GB");
    expect(profile!.linkedinUrl).toBe("https://linkedin.com/in/updatedname");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// f. PATCH — upsert merges profile on second PATCH
// ─────────────────────────────────────────────────────────────────────────────
describe("f. PATCH /api/users/me — second PATCH merges profile (upsert)", () => {
  let userId: string;

  beforeAll(async () => { const u = await mkUser("PatchMergeUser"); userId = u.id; });

  it("first PATCH sets employer", async () => {
    mockAuth.mockResolvedValue(makeSession(userId) as never);
    await mePATCH(patchMeReq({ employer: "Corp A" }));
    const profile = await db.candidateProfile.findUnique({ where: { userId } });
    expect(profile!.employer).toBe("Corp A");
  });

  it("second PATCH updates country without clearing employer", async () => {
    mockAuth.mockResolvedValue(makeSession(userId) as never);
    await mePATCH(patchMeReq({ country: "US" }));
    const profile = await db.candidateProfile.findUnique({ where: { userId } });
    expect(profile!.country).toBe("US");
    expect(profile!.employer).toBe("Corp A"); // not cleared
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// g. POST /api/profile/change-password — unauthorized
// ─────────────────────────────────────────────────────────────────────────────
describe("g. POST change-password — unauthorized returns 401", () => {
  it("returns 401 with no session", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await changePwdPOST(changePwdReq({
      newPassword: "ValidP@ssw0rd",
      confirmPassword: "ValidP@ssw0rd",
    }));
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// h. POST — invalid body
// ─────────────────────────────────────────────────────────────────────────────
describe("h. POST change-password — invalid body returns 400", () => {
  let userId: string;
  beforeAll(async () => { const u = await mkUser("PwdBadUser"); userId = u.id; });

  it("returns 400 when newPassword too short", async () => {
    mockAuth.mockResolvedValue(makeSession(userId) as never);
    const res = await changePwdPOST(changePwdReq({
      newPassword: "short",
      confirmPassword: "short",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when newPassword has no uppercase", async () => {
    mockAuth.mockResolvedValue(makeSession(userId) as never);
    const res = await changePwdPOST(changePwdReq({
      newPassword: "validpassword1!",
      confirmPassword: "validpassword1!",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when newPassword has no number", async () => {
    mockAuth.mockResolvedValue(makeSession(userId) as never);
    const res = await changePwdPOST(changePwdReq({
      newPassword: "ValidPassword!",
      confirmPassword: "ValidPassword!",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when newPassword has no special character", async () => {
    mockAuth.mockResolvedValue(makeSession(userId) as never);
    const res = await changePwdPOST(changePwdReq({
      newPassword: "ValidPassword1",
      confirmPassword: "ValidPassword1",
    }));
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// i. POST — wrong current password
// ─────────────────────────────────────────────────────────────────────────────
describe("i. POST change-password — wrong current password returns 400", () => {
  let userId: string;

  beforeAll(async () => {
    const hash = await bcrypt.hash("CorrectP@ssw0rd", 10);
    const u = await mkUser("PwdWrongUser", { passwordHash: hash });
    userId = u.id;
  });

  it("returns 400 with 'Current password is incorrect'", async () => {
    mockAuth.mockResolvedValue(makeSession(userId) as never);
    const res = await changePwdPOST(changePwdReq({
      currentPassword: "WrongP@ssw0rd",
      newPassword: "NewValidP@ss1",
      confirmPassword: "NewValidP@ss1",
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/current password/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// j. POST — mismatched confirmPassword
// ─────────────────────────────────────────────────────────────────────────────
describe("j. POST change-password — mismatched confirmPassword returns 400", () => {
  let userId: string;

  beforeAll(async () => {
    const hash = await bcrypt.hash("CorrectP@ssw0rd", 10);
    const u = await mkUser("PwdMismatchUser", { passwordHash: hash });
    userId = u.id;
  });

  it("returns 400 when confirmPassword does not match", async () => {
    mockAuth.mockResolvedValue(makeSession(userId) as never);
    const res = await changePwdPOST(changePwdReq({
      currentPassword: "CorrectP@ssw0rd",
      newPassword: "NewValidP@ss1",
      confirmPassword: "DifferentP@ss1",
    }));
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// k. POST — happy path
// ─────────────────────────────────────────────────────────────────────────────
describe("k. POST change-password — happy path sets new hash", () => {
  let userId: string;
  const CURRENT = "CorrectP@ssw0rd";
  const NEW_PWD = "NewValidP@ss1!";

  beforeAll(async () => {
    const hash = await bcrypt.hash(CURRENT, 10);
    const u = await mkUser("PwdHappyUser", { passwordHash: hash });
    userId = u.id;
  });

  it("returns 200 { ok: true }", async () => {
    mockAuth.mockResolvedValue(makeSession(userId) as never);
    const res = await changePwdPOST(changePwdReq({
      currentPassword: CURRENT,
      newPassword: NEW_PWD,
      confirmPassword: NEW_PWD,
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("new password hash verifies correctly", async () => {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, mustChangePassword: true },
    });
    expect(user!.passwordHash).not.toBeNull();
    const valid = await bcrypt.compare(NEW_PWD, user!.passwordHash!);
    expect(valid).toBe(true);
    expect(user!.mustChangePassword).toBe(false);
  });

  it("old password no longer works", async () => {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    const stillValid = await bcrypt.compare(CURRENT, user!.passwordHash!);
    expect(stillValid).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// l. POST — mustChangePassword=true skips current password check
// ─────────────────────────────────────────────────────────────────────────────
describe("l. POST change-password — forced change skips current password check", () => {
  let userId: string;
  const INITIAL = "InitialP@ssw0rd";
  const NEW_PWD = "ForcedNewP@ss1!";

  beforeAll(async () => {
    const hash = await bcrypt.hash(INITIAL, 10);
    const u = await mkUser("PwdForcedUser", { passwordHash: hash, mustChangePassword: true });
    userId = u.id;
  });

  it("succeeds without currentPassword when mustChangePassword=true", async () => {
    mockAuth.mockResolvedValue(makeSession(userId) as never);
    const res = await changePwdPOST(changePwdReq({
      newPassword: NEW_PWD,
      confirmPassword: NEW_PWD,
      // no currentPassword — allowed for forced change
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("clears mustChangePassword flag", async () => {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { mustChangePassword: true },
    });
    expect(user!.mustChangePassword).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// m. POST — missing currentPassword when not forced
// ─────────────────────────────────────────────────────────────────────────────
describe("m. POST change-password — missing currentPassword when required returns 400", () => {
  let userId: string;

  beforeAll(async () => {
    const hash = await bcrypt.hash("CorrectP@ssw0rd", 10);
    const u = await mkUser("PwdMissingCurrUser", { passwordHash: hash });
    userId = u.id;
  });

  it("returns 400 when currentPassword omitted for non-forced user", async () => {
    mockAuth.mockResolvedValue(makeSession(userId) as never);
    const res = await changePwdPOST(changePwdReq({
      newPassword: "NewValidP@ss1!",
      confirmPassword: "NewValidP@ss1!",
      // currentPassword deliberately omitted
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/current password/i);
  });
});
