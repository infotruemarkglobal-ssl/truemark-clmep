// Syncs src/lib/permission-definitions.ts (PERMISSIONS + SYSTEM_ROLE_PERMISSIONS)
// into the database — the same logic as POST /api/platform/permissions, as a
// standalone script for contexts with no HTTP session to call that route with
// (CI, one-off backfills against a fresh environment).
//
// Safe to run any number of times: upserts Permission rows (label/description/
// category refresh only) and adds any missing (role, permission) grant that
// isn't already there. Never removes a grant — an admin's live edits in the
// Permission Matrix UI (including a deliberate revocation) are never touched.
//
// Usage: npx ts-node --project tsconfig.seed.json prisma/sync-permissions.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PERMISSIONS, SYSTEM_ROLE_PERMISSIONS } from "../src/lib/permission-definitions";

const url =
  process.env.TEST_DIRECT_URL ??
  process.env.TEST_DATABASE_URL ??
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL ??
  "";
const adapter = new PrismaPg({ connectionString: url });
const db = new PrismaClient({ adapter });

async function main() {
  for (const p of PERMISSIONS) {
    await db.permission.upsert({
      where: { resource_action: { resource: p.resource, action: p.action } },
      update: { label: p.label, description: p.description, category: p.category },
      create: { resource: p.resource, action: p.action, label: p.label, description: p.description ?? "", category: p.category },
    });
  }
  console.log(`upserted ${PERMISSIONS.length} permission definitions`);

  let totalAdded = 0;
  for (const roleName of Object.keys(SYSTEM_ROLE_PERMISSIONS)) {
    const role = await db.customRole.upsert({
      where: { name: roleName },
      update: { isSystem: true },
      create: { name: roleName, isSystem: true, baseRole: roleName },
    });

    const pairs = SYSTEM_ROLE_PERMISSIONS[roleName];
    const permRecords = await db.permission.findMany({
      where: { OR: pairs.map(([resource, action]) => ({ resource, action })) },
    });

    let addedForRole = 0;
    for (const perm of permRecords) {
      const existing = await db.rolePermission.findUnique({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
      });
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
      if (!existing) addedForRole++;
    }
    totalAdded += addedForRole;
    console.log(`role ${roleName}: ${permRecords.length} defaults checked, ${addedForRole} newly added`);
  }

  console.log(`done — ${totalAdded} new (role, permission) grants added`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
