import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { sendMemberWelcome, sendEnrolmentConfirm, sendExamResult, sendEmailVerification, sendPasswordReset } from "@/inngest/functions/email";
import { certExpiryWarnings } from "@/inngest/functions/certExpiry";
import { cpdShortfallReminders } from "@/inngest/functions/cpdShortfall";
import { scanUpload } from "@/inngest/functions/uploadScan";
import { appealSlaMonitor } from "@/inngest/functions/appealSla";
import { orphanedAttemptCleanup } from "@/inngest/functions/orphanedAttempts";
import { breachDpaReminder } from "@/inngest/functions/breachReminder";
import { dbKeepalive } from "@/inngest/functions/dbKeepalive";
import { applicationAutoApprove } from "@/inngest/functions/applicationAutoApprove";
import { instalmentCharges } from "@/inngest/functions/instalmentCharges";
import { surveillanceScheduling } from "@/inngest/functions/surveillanceScheduling";
import { auditAnchor } from "@/inngest/functions/auditAnchor";
import { securityReviewCadence } from "@/inngest/functions/securityReviewCadence";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    sendMemberWelcome,
    sendEnrolmentConfirm,
    sendExamResult,
    sendEmailVerification,
    sendPasswordReset,
    certExpiryWarnings,
    cpdShortfallReminders,
    scanUpload,
    appealSlaMonitor,
    orphanedAttemptCleanup,
    breachDpaReminder,
    dbKeepalive,
    applicationAutoApprove,
    instalmentCharges,
    surveillanceScheduling,
    auditAnchor,
    securityReviewCadence,
  ],
});
