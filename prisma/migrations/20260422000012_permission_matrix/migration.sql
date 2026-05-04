-- Migration: 20260422000012_permission_matrix
--
-- Adds the permission matrix tables:
--   permissions      — catalogue of every platform action (resource + action)
--   custom_roles     — named roles, both system (mirrors user.role) and custom
--   role_permissions — many-to-many: which permissions each role has
--   user_custom_roles — many-to-many: which custom roles each user holds

CREATE TABLE "permissions" (
  "id"          TEXT NOT NULL,
  "resource"    TEXT NOT NULL,
  "action"      TEXT NOT NULL,
  "label"       TEXT NOT NULL,
  "description" TEXT,
  "category"    TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "permissions_resource_action_key" ON "permissions"("resource", "action");

CREATE TABLE "custom_roles" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "isSystem"    BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "custom_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "custom_roles_name_key" ON "custom_roles"("name");

CREATE TABLE "role_permissions" (
  "roleId"       TEXT NOT NULL,
  "permissionId" TEXT NOT NULL,

  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId", "permissionId"),
  CONSTRAINT "role_permissions_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "custom_roles"("id") ON DELETE CASCADE,
  CONSTRAINT "role_permissions_permissionId_fkey"
    FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE
);

CREATE TABLE "user_custom_roles" (
  "userId"     TEXT NOT NULL,
  "roleId"     TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignedBy" TEXT,

  CONSTRAINT "user_custom_roles_pkey" PRIMARY KEY ("userId", "roleId"),
  CONSTRAINT "user_custom_roles_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "user_custom_roles_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "custom_roles"("id") ON DELETE CASCADE
);
