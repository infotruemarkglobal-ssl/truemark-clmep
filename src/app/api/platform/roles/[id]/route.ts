// TODO: STUB — not yet implemented.
//
// This route should expose individual custom-role management for SUPER_ADMIN:
//   GET    — return role details (name, description, permissionIds, user count)
//   PATCH  — rename a role or update its description (system roles must be immutable)
//   DELETE — delete a custom role (must reject if any users are assigned to it)
//
// Permission assignment is already handled by the sibling route:
//   /api/platform/roles/[id]/permissions  (PUT)
//
// See feature backlog: "Platform Settings — Custom Role CRUD API"

import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await params;
  return NextResponse.json(
    { error: "Not implemented. Role detail API is not yet available." },
    { status: 501 },
  );
}

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await params;
  return NextResponse.json(
    { error: "Not implemented. Role update API is not yet available." },
    { status: 501 },
  );
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await params;
  return NextResponse.json(
    { error: "Not implemented. Role delete API is not yet available." },
    { status: 501 },
  );
}
