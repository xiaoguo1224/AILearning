import { LandingPage } from "@/components/landing/LandingPage";
import { listCourses } from "@/lib/api";
import { getTranslator } from "@/lib/locale-server";
import type { CourseSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const t = await getTranslator();
  let courses: CourseSummary[] = [];
  let unavailable = false;
  try {
    courses = await listCourses(t.locale);
  } catch (error) {
    unavailable = !(error instanceof Error && "status" in error && error.status === 401);
  }
  return <LandingPage courses={courses} unavailable={unavailable} />;
}
