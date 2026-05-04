// TODO: STUB — not yet implemented.
//
// This route should expose individual user management for SUPER_ADMIN / CERTIFICATION_OFFICER:
//   GET  — return full user profile (name, email, role, MFA status, enrolments, audit log)
//   PUT  — update user fields (name, role, active status, mustChangePassword)
//   DELETE — soft-delete / deactivate a user account
//
// Currently, user data is fetched server-side in the admin dashboard pages directly.
// Implement this route when the admin UI needs a dedicated user-detail API endpoint.
//
// See feature backlog: "Admin — User Management CRUD API"

import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await params;
  return NextResponse.json(
    { error: "Not implemented. User detail API is not yet available." },
    { status: 501 },
  );
}

export async function PUT(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await params;
  return NextResponse.json(
    { error: "Not implemented. User update API is not yet available." },
    { status: 501 },
  );
}
