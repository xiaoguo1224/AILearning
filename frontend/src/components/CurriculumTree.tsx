import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { NewExploreSessionButton } from "@/components/NewExploreSessionButton";
import { ContentReviewButton } from "@/components/ContentReviewButton";
import type { Translator } from "@/lib/i18n";
import type { CurriculumPoint, ProjectCurriculum } from "@/lib/types";

const STATUSES = { unassessed: "Not assessed", learning: "Learning", needs_review: "Needs review", ready_for_advanced: "Ready for advanced practice" };
const RECOMMENDATIONS = { review: "Review the error first", prerequisite: "Strengthen prerequisites", foundation: "Foundation practice", consolidation: "Consolidation practice", advanced: "Advanced practice", integrated: "Integrated practice" };

export function CurriculumTree({ data, archived, t }: { data: ProjectCurriculum; archived: boolean; t: Translator }) {
  const indexes = new Map(data.points.map((point, index) => [point.key, index]));
  function draft(point: CurriculumPoint) {
    return t("Help me study {0}. Recommended focus: {1}. Prerequisites to check: {2}. Explain the mathematics, tensor shapes, purpose and PyTorch implementation, then suggest one local exercise. Separate source material from extensions; do not execute code.", point.label, t(RECOMMENDATIONS[point.recommendation]), point.prerequisites.filter(item => !item.ready).map(item => item.label).join(", ") || t("None identified"));
  }
  return <div className="space-y-8">
    <p>{t("Choose any lesson freely. Prerequisites guide your choices and never lock a lesson.")}</p>
    <p className="text-small text-ink-muted">{t("Completed chapters and practice evidence are separate. Advancement requires three recent correct formal answers across at least two questions; retries and remedial practice do not qualify. This is guidance, not a mastery certificate.")}</p>
    {data.courses.length === 0 && <p>{t("Link a course from the project page to build your course tree.")}</p>}
    {data.courses.map(course => <section key={course.id} className="space-y-4">
      <h2 className="text-title"><Link href={`/courses/${course.id}`} className="text-accent underline">{course.title}</Link></h2>
      {course.modules.map(module => <div key={module.id} className="space-y-2 border-l border-line pl-4">
        <h3 className="font-medium">{module.title}</h3>
        <ul className="space-y-3">{module.lessons.map(lesson => <li key={lesson.id}>
          <Link className="text-accent underline" href={`/courses/${course.id}/lessons/${lesson.id}`}>{lesson.title}</Link>{" "}<Badge>{t(lesson.completed ? "Completed" : "Not completed")}</Badge>
          {!archived && <ContentReviewButton projectId={data.project_id} kind="lesson" sourceId={lesson.id} />}
          <ul className="flex flex-wrap gap-3 text-small">{lesson.concept_keys.map(key => <li key={key}><Link className="text-accent underline" href={`#point-${indexes.get(key)}`}>{data.points[indexes.get(key) ?? 0]?.label ?? key}</Link></li>)}</ul>
        </li>)}</ul>
      </div>)}
    </section>)}
    <section className="space-y-4"><h2 className="text-title">{t("Knowledge points and next steps")}</h2>
      {data.points.map((point, index) => <article key={point.key} id={`point-${index}`} className="space-y-3 rounded-surface border border-line p-4">
        <h3 className="text-title">{point.label}</h3><Badge>{t(STATUSES[point.status])}</Badge>
        <p>{t("{0} formal answers across {1} questions", point.evidence_count, point.distinct_items)}</p>
        <p>{t("Suggested next step: {0}", t(RECOMMENDATIONS[point.recommendation]))}</p>
        {point.prerequisites.length > 0 && <div><h4>{t("Recommended prerequisites")}</h4><ul className="space-y-1">{point.prerequisites.map(parent => <li key={`${parent.in_project}-${parent.key}`}>
          {parent.in_project ? <Link className="text-accent underline" href={`#point-${indexes.get(parent.key)}`}>{parent.label}</Link> : <span>{t(parent.label)}</span>}{" · "}{t(parent.ready ? "Ready for advanced practice" : "Not yet evidenced")}
          {!parent.in_project && parent.reading && <> · <a href={parent.reading.url} target="_blank" rel="noreferrer" className="text-accent underline">{parent.reading.title}</a></>}
        </li>)}</ul></div>}
        {point.reading ? <p>{t("D2L Chinese reading")}: <a className="text-accent underline" href={point.reading.url} target="_blank" rel="noreferrer">{point.reading.title}</a></p> : <p className="text-small text-ink-muted">{t("No verified textbook mapping. Treat additional explanations as extensions.")}</p>}
        <div className="flex flex-wrap gap-4">{point.knowledge_ids.map(id => <Link key={id} href={`/projects/${data.project_id}/knowledge?entry=${id}`} className="text-accent underline">{t("Knowledge entry {0}", id)}</Link>)}</div>
        {!archived && <NewExploreSessionButton projectId={data.project_id} draft={draft(point)} label={t("Prepare a learning question")} />}
      </article>)}
    </section>
    <section className="space-y-3"><h2 className="text-title">{t("Suggested knowledge pathway")}</h2>
      <p className="text-small text-ink-muted">{t("This pathway is a teaching suggestion, not a fixed schedule or a claim that these courses already exist.")}</p>
      <ol className="space-y-2">{data.pathway.map(topic => <li key={topic.id}>
        <span className="font-medium">{t(topic.title)}</span>{topic.prerequisites.length > 0 && <span> · {t("After {0}", topic.prerequisites.map(id => t(data.pathway.find(item => item.id === id)?.title ?? id)).join(", "))}</span>}
        {topic.reading ? <> · <a href={topic.reading.url} target="_blank" rel="noreferrer" className="text-accent underline">{topic.reading.title}</a></> : <> · {t("Extension topic")}</>}
      </li>)}</ol>
    </section>
  </div>;
}
