"use client";

import dynamic from "next/dynamic";

// ssr: false is only valid inside a "use client" component (Next.js 16 / Turbopack).
// This wrapper exists solely to host the dynamic import — all data fetching
// remains in the parent Server Component (app/(dashboard)/exams/[id]/page.tsx).
const ExamInterface = dynamic(() => import("@/components/exams/ExamInterface"), {
  ssr: false,
});

type Option = { id: string; text: string };
type Question = {
  id: string;
  questionText: string;
  questionType: "MCQ" | "mcq_single" | "mcq_multi" | "true_false" | "fill_blank" | "essay" | "drag_drop";
  options: Option[];
  marks: number;
  order: number;
};

type ExamState = {
  attemptId: string;
  examPaperId: string;
  proctoringSessionId: string;
  questions: Question[];
  timeLimitMins: number;
  startedAt: string;
  requiresProctoring: boolean;
  tabSwitchLimit: number;
};

export default function ExamClientWrapper({
  examState,
  examTitle,
  passMark,
}: {
  examState: ExamState;
  examTitle: string;
  passMark: number;
}) {
  return <ExamInterface examState={examState} examTitle={examTitle} passMark={passMark} />;
}
