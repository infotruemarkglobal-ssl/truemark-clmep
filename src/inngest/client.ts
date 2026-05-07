import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "truemark-clmep",
  name: "Truemark Global CLMEP",
  eventKey: process.env.INNGEST_EVENT_KEY,
});

// ─── Event type catalogue ─────────────────────────────────────────────────────
// Centralised so every function and caller uses the same event names.

export const EVENTS = {
  SEND_MEMBER_WELCOME:       "email/member.welcome",
  SEND_ENROLMENT_CONFIRM:    "email/enrolment.confirmed",
  SEND_EXAM_RESULT:          "email/exam.result",
  SEND_EMAIL_VERIFICATION:   "email/verification.requested",
  SEND_PASSWORD_RESET:       "email/password.reset.requested",
  SEND_SEAT_ASSIGNED:        "email/seat.assigned",
  SEND_TICKET_CREATED:       "email/ticket.created",
  SEND_TICKET_REPLY:         "email/ticket.reply",
  SEND_TICKET_RESOLVED:      "email/ticket.resolved",
  SEND_ADMIN_PASSWORD_RESET: "email/admin.password.reset",
  SCAN_UPLOAD:               "upload/scan.requested",
  BREACH_REPORTED:           "breach/reported",
  APPLICATION_AUTO_APPROVE:  "application/auto-approve-check",
} as const;
