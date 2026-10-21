import type { ReactNode } from "react";
import { CourseOpenTracker } from "@/components/CourseOpenTracker";

export default async function CourseLayout({ children, params }: {
  children: ReactNode; params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  return <><CourseOpenTracker courseId={Number(courseId)} />{children}</>;
}
