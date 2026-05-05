-- AlterTable: purchases — add stripeSessionId, seats
ALTER TABLE "purchases" ADD COLUMN "stripeSessionId" TEXT;
ALTER TABLE "purchases" ADD COLUMN "seats" INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX "purchases_stripeSessionId_key" ON "purchases"("stripeSessionId");

-- CreateTable: course_seats
CREATE TABLE "course_seats" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "totalSeats" INTEGER NOT NULL,
    "usedSeats" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable: seat_assignments
CREATE TABLE "seat_assignments" (
    "id" TEXT NOT NULL,
    "seatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enrolmentId" TEXT,

    CONSTRAINT "seat_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "course_seats_organisationId_courseId_purchaseId_key" ON "course_seats"("organisationId", "courseId", "purchaseId");
CREATE INDEX "course_seats_organisationId_idx" ON "course_seats"("organisationId");
CREATE INDEX "course_seats_courseId_idx" ON "course_seats"("courseId");
CREATE UNIQUE INDEX "seat_assignments_enrolmentId_key" ON "seat_assignments"("enrolmentId");
CREATE UNIQUE INDEX "seat_assignments_seatId_userId_key" ON "seat_assignments"("seatId", "userId");
CREATE INDEX "seat_assignments_seatId_idx" ON "seat_assignments"("seatId");
CREATE INDEX "seat_assignments_userId_idx" ON "seat_assignments"("userId");

-- AddForeignKey
ALTER TABLE "course_seats" ADD CONSTRAINT "course_seats_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "course_seats" ADD CONSTRAINT "course_seats_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "course_seats" ADD CONSTRAINT "course_seats_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "course_seats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_enrolmentId_fkey" FOREIGN KEY ("enrolmentId") REFERENCES "enrolments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
