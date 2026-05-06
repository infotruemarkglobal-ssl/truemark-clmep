import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { sendMemberWelcome, sendEnrolmentConfirm, sendExamResult, sendEmailVerification, sendPasswordReset } from "@/inngest/functions/email";
import { certExpiryWarnings } from "@/inngest/functions/certExpiry";
import { scanUpload } from "@/inngest/functions/uploadScan";
import { appealSlaMonitor } from "@/inngest/functions/appealSla";
import { orphanedAttemptCleanup } from "@/inngest/functions/orphanedAttempts";
import { breachDpaReminder } from "@/inngest/functions/breachReminder";
import { dbKeepalive } from "@/inngest/functions/dbKeepalive";
import { applicationAutoApprove } from "@/inngest/functions/applicationAutoApprove";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    sendMemberWelcome,
    sendEnrolmentConfirm,
    sendExamResult,
    sendEmailVerification,
    sendPasswordReset,
    certExpiryWarnings,
    scanUpload,
    appealSlaMonitor,
    orphanedAttemptCleanup,
    breachDpaReminder,
    dbKeepalive,
    applicationAutoApprove,
  ],
});
