// Shared helpers for the Tier 5 policy-document generation scripts —
// building a real PDF via pdf-lib and registering it in the Document
// Library the same way POST /api/documents + the approve transaction in
// PATCH /api/documents/[id] do, direct-Prisma (no HTTP), matching
// prisma/sync-permissions.ts's script convention.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import crypto from "crypto";
import { uploadFile } from "../src/lib/storage";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });
export const db = new PrismaClient({ adapter });
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001").replace(/\/$/, "");

export type Section = { heading: string; body: string[] };

function newWriter(page: PDFPage, font: PDFFont, boldFont: PDFFont, x: number, yStart: number, lineHeight: number) {
  let y = yStart;
  return {
    heading(text: string): boolean {
      if (y < 90) return false;
      page.drawText(text, { x, y, size: 12, font: boldFont, color: rgb(0.05, 0.3, 0.2) });
      y -= lineHeight + 4;
      return true;
    },
    paragraphLine(text: string): boolean {
      if (y < 60) return false;
      page.drawText(text, { x, y, size: 9.5, font, color: rgb(0.15, 0.15, 0.15) });
      y -= lineHeight;
      return true;
    },
    gap() { y -= 6; },
  };
}

export async function buildPolicyPdf(title: string, subtitle: string, sections: Section[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const margin = 50;
  let page = doc.addPage([595, 842]);

  page.drawText(title, { x: margin, y: 800, size: 15, font: boldFont, color: rgb(0.05, 0.3, 0.2) });
  page.drawText(subtitle, { x: margin, y: 782, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
  let writer = newWriter(page, font, boldFont, margin, 755, 13);

  for (const section of sections) {
    if (!writer.heading(section.heading)) {
      page = doc.addPage([595, 842]);
      writer = newWriter(page, font, boldFont, margin, 780, 13);
      writer.heading(section.heading);
    }
    for (const line of section.body) {
      if (!writer.paragraphLine(line)) {
        page = doc.addPage([595, 842]);
        writer = newWriter(page, font, boldFont, margin, 780, 13);
        writer.paragraphLine(line);
      }
    }
    writer.gap();
  }

  return doc.save();
}

export async function upsertPolicyDocument(opts: {
  title: string;
  type: "policy" | "report";
  description: string;
  pdfBytes: Uint8Array;
  keyPrefix: string;
  changeNotes: string;
  approverId: string;
}) {
  const existing = await db.document.findFirst({
    where: { title: opts.title, type: opts.type },
    include: { versions: { orderBy: { createdAt: "desc" } } },
  });

  const key = `pdfs/${opts.keyPrefix}-${crypto.randomUUID()}.pdf`;
  await uploadFile({ buffer: Buffer.from(opts.pdfBytes), key, contentType: "application/pdf" });
  const fileUrl = `${APP_URL}/api/files/url?key=${encodeURIComponent(key)}`;

  const nextVersion = existing ? String(existing.versions.length + 1) + ".0" : "1.0";

  let documentId: string;
  let newVersionId: string;
  let previouslyActiveId: string | null = null;

  if (!existing) {
    const created = await db.document.create({
      data: {
        title: opts.title,
        type: opts.type,
        description: opts.description,
        accessLevel: "internal",
        createdBy: opts.approverId,
        versions: {
          create: {
            version: nextVersion,
            status: "DRAFT",
            fileUrl,
            changeNotes: opts.changeNotes,
            createdBy: opts.approverId,
          },
        },
      },
      include: { versions: true },
    });
    documentId = created.id;
    newVersionId = created.versions[0].id;
  } else {
    documentId = existing.id;
    previouslyActiveId = existing.versions.find((v) => v.status === "ACTIVE")?.id ?? null;
    const newVersion = await db.documentVersion.create({
      data: {
        documentId,
        version: nextVersion,
        status: "DRAFT",
        fileUrl,
        changeNotes: opts.changeNotes,
        createdBy: opts.approverId,
      },
    });
    newVersionId = newVersion.id;
  }

  await db.$transaction(async (tx) => {
    if (previouslyActiveId) {
      await tx.documentVersion.update({ where: { id: previouslyActiveId }, data: { status: "SUPERSEDED", supersededAt: new Date() } });
    }
    await tx.documentVersion.update({
      where: { id: newVersionId },
      data: { status: "ACTIVE", approvedBy: opts.approverId, approvedAt: new Date() },
    });
  });

  console.log(`  ✓ "${opts.title}" — version ${nextVersion}, ${existing ? "new version approved" : "created + approved"}`);
  return { documentId, versionId: newVersionId };
}
