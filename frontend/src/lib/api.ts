import { browserLocale, createTranslator, type Locale } from "./i18n";
import { formatUsd } from "./format";
import type {
  AlertState,
  AnswerResult,
  CompleteResult,
  CourseConcepts,
  CourseDeletion,
  CourseDetail,
  CoursePlan,
  CourseSummary,
  DayOff,
  DayOffRemoval,
  DaysOff,
  GenerateResult,
  LessonDetail,
  PracticeAnswer,
  PracticeConflict,
  PracticeState,
  ProjectDetail,
  ProjectInput,
  ProjectList,
  ProjectStatus,
  ReferenceSolution,
  ResourceSummary,
  ResourceDetail,
  ResourceSearchResult,
  ReviewHint,
  SubmissionDetail,
  SubmissionList,
  VariantDraft,
  CreateSubmissionPayload,
  CodeReviewSummary,
  UploadSubmissionInput,
  CreateSessionPayload,
  ExploreAskResult,
  ExplorePracticeResult,
  ExploreSession,
  ExploreSessionDetail,
  ExploreSessionList,
  KnowledgeCompare,
  KnowledgeDetail,
  KnowledgeKind,
  KnowledgeList,
  KnowledgeRevisionDetail,
  KnowledgeRevisionList,
  KnowledgeStatus,
  RemediationConflict,
  RemediationNote,
  ReviewAnswerResult,
  ReviewQueue,
  ProjectReviewTasks,
  DiagnosisCause,
  LearningSuggestion,
  SuggestionList,
  ProjectCurriculum,
  ContentReview,
  ReviewRatingResult,
  ReviewToday,
  SourceFailure,
  SourceInput,
  SourceLimits,
  TutorConflict,
  TutorConversation,
  TutorMode,
  TutorTurn,
  UsageSummary,
  QuizItem,
} from "./types";

const BASE_URL =
  (typeof window === "undefined" ? process.env.API_INTERNAL_URL : undefined) ??
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function listProjectReviewTasks(projectId: number, locale?: Locale): Promise<ProjectReviewTasks> {
  return get(`/api/projects/${projectId}/review-tasks`, locale);
}

export function getProjectPractice(projectId: number, concept: string, locale?: Locale): Promise<ReviewQueue> {
  return get(`/api/projects/${projectId}/review-tasks/practice?concept=${encodeURIComponent(concept)}`, locale);
}

export function recordDiagnosis(projectId: number, data: { concept_key: string; cause: DiagnosisCause; note: string; review_id?: number; finding_index?: number }): Promise<{ id: number }> {
  return request(`/api/projects/${projectId}/errors${data.review_id !== undefined ? "/from-review" : ""}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
  });
}

export function dismissDiagnosis(errorId: number): Promise<{ id: number }> {
  return request(`/api/errors/${errorId}/dismiss`, { method: "POST" });
}

export function listSuggestions(projectId: number, offset = 0, locale?: Locale): Promise<SuggestionList> {
  return get(`/api/projects/${projectId}/suggestions?offset=${offset}`, locale);
}

export function getProjectCurriculum(projectId: number, locale?: Locale): Promise<ProjectCurriculum> {
  return get(`/api/projects/${projectId}/curriculum`, locale);
}

export function requestContentReview(projectId: number, kind: "lesson" | "solution", sourceId: number): Promise<ContentReview> {
  return request(`/api/projects/${projectId}/content-reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source_kind: kind, source_id: sourceId }) });
}
export function listContentReviews(projectId: number, offset = 0, locale?: Locale): Promise<{ items: ContentReview[]; total: number }> {
  return get(`/api/projects/${projectId}/content-reviews?offset=${offset}`, locale);
}
export function createSuggestion(projectId: number, sourceErrorId: number, targetProjectId: number): Promise<LearningSuggestion> {
  return request(`/api/projects/${projectId}/suggestions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source_error_id: sourceErrorId, target_project_id: targetProjectId }) });
}
export function decideSuggestion(id: number, decision: "accepted" | "rejected"): Promise<LearningSuggestion> {
  return request(`/api/suggestions/${id}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
}

/** A shared request boundary for browser calls and explicit server locale forwarding. */
async function localizedFetch(input: RequestInfo | URL, init?: RequestInit, locale: Locale = browserLocale()): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Accept-Language", locale);
  return fetch(input, { ...init, headers });
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Thrown by generateFromSources on a 422 source_failed response: one or more sources
 * could not be read, individually, rather than one form-level refusal. `sources` carries
 * the per-source detail a caller maps back onto its own rows by `index`.
 */
export class SourceGenerationError extends ApiError {
  constructor(
    status: number,
    message: string,
    public readonly sources: SourceFailure[],
  ) {
    super(status, message);
    this.name = "SourceGenerationError";
  }
}

/** Shape of a FastAPI HTTPException(detail={...}) object body, as opposed to a plain string detail. */
interface ObjectDetail {
  error?: string;
  message?: string;
  limit_usd?: number;
  spent_usd?: number;
  [key: string]: unknown;
}

/**
 * What a spend-cap refusal stopped, in the words of the endpoint that was refused.
 *
 * The 402 body is identical whichever endpoint raised it, so the limit and the amounts
 * are the only things this file can state on its own. What the refused call would have
 * produced is not in the body, and only the caller knows it: generation loses a course,
 * a re-teach loses an explanation, and a shared formatter asserting either one is wrong
 * for every other caller. Omit it and the message stops at what is true everywhere.
 */
const COST_LIMIT_CONSEQUENCE = {
  generate: "Generation was stopped, no course was saved for this run.",
  // The cap is checked before the provider call and a re-teach is a single call, so
  // nothing was written and nothing was spent on this attempt.
  remediation: "No explanation was written, and this attempt spent nothing.",
  // True for the same two reasons, and checked against the endpoint rather than assumed:
  // the cap is tested before the model is called, and a turn that fails writes neither
  // row, the learner's own message included. So the transcript is exactly as it was.
  tutor: "No message was recorded, and this attempt spent nothing.",
  // Same two reasons again: the explore endpoint commits both rows only after the reply
  // has parsed, and the cap is checked before the provider call, so a refused question
  // leaves the session untouched.
  explore: "No message was recorded, and this attempt spent nothing.",
  // The practice endpoint writes its reply and its draft together, after the model has
  // answered, and the cap is checked before the provider call. So a refusal here leaves
  // the transcript and the exercise list exactly as they were.
  practice: "No exercise was recorded, and this attempt spent nothing.",
} as const;

/** Returns null when the detail carries nothing useful, so the caller keeps its statusText fallback. */
function messageFromObjectDetail(detail: ObjectDetail, consequence?: string, locale: Locale = browserLocale()): string | null {
  const t = createTranslator(locale);
  if (detail.error === "cost_limit_exceeded") {
    const tail = consequence ? ` ${t(consequence)}` : "";
    if (typeof detail.limit_usd === "number" && typeof detail.spent_usd === "number") {
      return `${t("LLM spend limit reached: {0} spent of a {1} cap.", formatUsd(detail.spent_usd), formatUsd(detail.limit_usd))}${tail}`;
    }
    return `${t("LLM spend limit reached.")}${tail}`;
  }
  if (typeof detail.message === "string" && detail.message) {
    return detail.message;
  }
  return null;
}

/** FastAPI sends 422 validation errors as an array of {loc, msg, type}; surface the first msg. */
function messageFromValidationDetail(detail: unknown[]): string | null {
  const first = detail[0];
  if (first && typeof first === "object" && typeof (first as { msg?: unknown }).msg === "string") {
    return (first as { msg: string }).msg;
  }
  return null;
}

/** Turn a non-2xx response into the ApiError every caller already knows. */
async function errorFromResponse(
  res: Response,
  costLimitConsequence?: string,
  locale?: Locale,
): Promise<ApiError> {
  let message = res.statusText || `Request failed with status ${res.status}`;
  let code: string | undefined;
  try {
    const body = await res.json();
    const detail = body?.detail;
    if (typeof detail === "string") {
      message = detail;
    } else if (Array.isArray(detail)) {
      message = messageFromValidationDetail(detail) ?? message;
    } else if (detail && typeof detail === "object") {
      if (typeof detail.error === "string") code = detail.error;
      message = messageFromObjectDetail(detail as ObjectDetail, costLimitConsequence, locale) ?? message;
    }
  } catch {
    // Non-JSON error body - keep the statusText fallback.
  }
  return new ApiError(res.status, createTranslator(locale ?? browserLocale())(message), code);
}

async function request<T>(
  path: string,
  init?: RequestInit,
  costLimitConsequence?: string,
  locale?: Locale,
): Promise<T> {
  const res = await localizedFetch(`${BASE_URL}${path}`, init, locale);
  if (!res.ok) throw await errorFromResponse(res, costLimitConsequence, locale);
  return res.json() as Promise<T>;
}

/** A request whose success carries no body, such as a 204 DELETE. */
async function requestNoContent(path: string, init?: RequestInit, locale?: Locale): Promise<void> {
  const res = await localizedFetch(`${BASE_URL}${path}`, init, locale);
  if (!res.ok) throw await errorFromResponse(res, undefined, locale);
}

function get<T>(path: string, locale?: Locale): Promise<T> {
  return request<T>(path, { cache: "no-store" }, undefined, locale);
}

function postJson<T>(path: string, body: unknown, costLimitConsequence?: string): Promise<T> {
  return request<T>(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    costLimitConsequence,
  );
}

function patchJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export interface LessonPatchInput {
  title?: string;
  content?: string;
  concepts?: string[];
}

export function patchLesson(
  lessonId: number,
  patch: LessonPatchInput,
): Promise<{ id: number; title: string }> {
  return patchJson(`/api/lessons/${lessonId}`, patch);
}

export function patchCourse(
  courseId: number,
  patch: { title?: string; description?: string },
): Promise<{ id: number; title: string }> {
  return patchJson(`/api/courses/${courseId}`, patch);
}

export interface ImportFileInput {
  path: string;
  content: string;
}

export function importCourseFromMarkdown(files: ImportFileInput[]): Promise<{
  id: number;
  title: string;
  modules: number;
  lessons: number;
}> {
  return postJson("/api/courses/import", { files });
}

function putJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function listCourses(locale?: Locale): Promise<CourseSummary[]> {
  return get("/courses", locale);
}

export function listProjects(status: ProjectStatus = "active", offset = 0, locale?: Locale): Promise<ProjectList> {
  return get(`/api/projects?status=${status}&offset=${offset}&limit=20`, locale);
}
export function getProject(id: number, locale?: Locale): Promise<ProjectDetail> {
  return get(`/api/projects/${id}`, locale);
}
export function createProject(body: ProjectInput): Promise<ProjectDetail> {
  return postJson("/api/projects", body);
}
export function updateProject(id: number, body: Partial<ProjectInput> & { expected_updated_at?: string }): Promise<ProjectDetail> {
  return request(`/api/projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
export function archiveProject(id: number): Promise<ProjectDetail> {
  return request(`/api/projects/${id}/archive`, { method: "POST" });
}
export function linkProjectCourse(id: number, courseId: number, position: number): Promise<ProjectDetail> {
  return putJson(`/api/projects/${id}/courses/${courseId}`, { position });
}
export function unlinkProjectCourse(id: number, courseId: number): Promise<ProjectDetail> {
  return request(`/api/projects/${id}/courses/${courseId}`, { method: "DELETE" });
}

/**
 * What deleting this course would destroy, without destroying it. Costs nothing.
 *
 * Fetched when the confirmation OPENS rather than when the list renders. The list page
 * holds only id, title and description, so these counts are not already in hand, and
 * asking for every card on every render would be N requests to draw a page on which
 * usually nothing is deleted.
 */
export function getDeletionPreview(id: number): Promise<CourseDeletion> {
  return get(`/courses/${id}/deletion-preview`);
}

/**
 * Delete a course and get back what went with it, in the preview's shape.
 *
 * IRREVERSIBLE, and wider than the word "course" suggests: the cascade takes the
 * modules, the lessons, the quiz items and every answer the learner ever gave in it, and
 * the server retires review cards for concepts no surviving course teaches. The caller
 * is expected to have shown those counts first.
 *
 * A 404 here carries a BARE STRING detail, "Course not found", not the coded object the
 * 422s use. `request` already handles both, returning the string as the message and
 * reading `message` out of an object, so the two parsing branches are one call site's
 * concern rather than this function's. That asymmetry is pinned by a backend test, so it
 * is deliberate and not drift.
 *
 * Goes through plain `request`. There is no 409 carrying a payload on either endpoint,
 * so neither needs the bespoke fetch that requestRemediation and sendTutorMessage use.
 */
export function deleteCourse(id: number): Promise<CourseDeletion> {
  return request(`/courses/${id}`, { method: "DELETE" });
}

export function getCourse(id: number, locale?: Locale): Promise<CourseDetail> {
  return get(`/courses/${id}`, locale);
}

export function getLesson(id: number, locale?: Locale): Promise<LessonDetail> {
  return get(`/lessons/${id}`, locale);
}

/** The concept map's data: every concept in the course, its lesson, and its mastery. */
export function getCourseConcepts(id: number, locale?: Locale): Promise<CourseConcepts> {
  return get(`/courses/${id}/concepts`, locale);
}

export function generateFromText(text: string): Promise<GenerateResult> {
  return postJson("/courses/generate", { text }, COST_LIMIT_CONSEQUENCE.generate);
}

export function generateFromUrl(url: string): Promise<GenerateResult> {
  return postJson("/courses/generate", { url }, COST_LIMIT_CONSEQUENCE.generate);
}

export function generateFromPdf(file: File): Promise<GenerateResult> {
  const form = new FormData();
  form.append("file", file);
  return request(
    "/courses/generate/pdf",
    { method: "POST", body: form },
    COST_LIMIT_CONSEQUENCE.generate,
  );
}

/** The generation caps to validate against before submitting. Costs nothing. */
export function getGenerationLimits(): Promise<SourceLimits> {
  return get("/meta/limits");
}

/**
 * The multipart body's non-file parts (here, just `sources`) are capped by the server's
 * multipart parser itself, before the route handler runs, so an oversized one comes back
 * as a bare-string 400 rather than the structured source_too_large shape the route's own
 * checks produce. Checked client-side first so that case is a clear local message instead
 * of a confusing round trip.
 */
const SOURCES_PART_LIMIT_BYTES = 1024 * 1024;

/**
 * One course from any mix of pasted text, URLs and PDFs, combined into a single
 * POST /courses/generate/multipart request.
 *
 * COMBINED SEND ORDER IS `sources` THEN `files`, both in the order given here. That is
 * what `index` in a source_failed response counts from, so a caller building both arrays
 * in a different relative order will map failures onto the wrong rows.
 *
 * Does not go through `request`, for the same reason requestRemediation does not: a 422
 * source_failed response carries per-source detail a caller needs to redraw its own rows
 * with, not just a message, so it is returned as a typed error rather than flattened into
 * one.
 */
export async function generateFromSources(
  sources: SourceInput[],
  files: File[],
): Promise<GenerateResult> {
  const form = new FormData();
  if (sources.length > 0) {
    const serialized = JSON.stringify(sources);
    if (new Blob([serialized]).size > SOURCES_PART_LIMIT_BYTES) {
      throw new ApiError(
        413,
        "Your pasted text and URLs come to more than one request can carry. Split them " +
          "across two generations, or trim the largest one.",
      );
    }
    form.append("sources", serialized);
  }
  for (const file of files) {
    form.append("file", file);
  }

  const res = await localizedFetch(`${BASE_URL}/courses/generate/multipart`, {
    method: "POST",
    body: form,
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON body, so the status has to carry the meaning on its own.
  }
  if (res.ok) return body as GenerateResult;

  const detail = (body as { detail?: unknown } | null)?.detail;
  if (
    detail &&
    typeof detail === "object" &&
    (detail as { error?: unknown }).error === "source_failed" &&
    Array.isArray((detail as { sources?: unknown }).sources)
  ) {
    const failed = detail as { message?: string; sources: SourceFailure[] };
    throw new SourceGenerationError(
      res.status,
      createTranslator(browserLocale())(failed.message || "Some of your sources could not be read."),
      failed.sources,
    );
  }
  const fallback = res.statusText || `Request failed with status ${res.status}`;
  throw new ApiError(
    res.status,
    messageFromErrorBody(body, fallback, COST_LIMIT_CONSEQUENCE.generate),
  );
}


/** Events from POST /courses/generate/stream, in stream order. */
export interface StreamQuizItem {
  question: string;
  kind: string;
  options?: string[];
  answer: string;
  concept?: string;
}
export interface StreamLesson {
  title: string;
  content: string;
  concepts: string[];
  quiz: StreamQuizItem[];
}
export interface StreamOutlineModule {
  title: string;
  lessons: { title: string }[];
}
export type GenerationStreamEvent =
  | { type: "outline"; title: string; description: string; modules: StreamOutlineModule[] }
  | { type: "lesson"; module_index: number; lesson_index: number; lesson: StreamLesson }
  | { type: "lesson_failed"; module_index: number; lesson_index: number; title: string }
  | { type: "done"; id: number; title: string; usage: GenerateResult["usage"] }
  | { type: "error"; error: string; message?: string }
  // Course regeneration streams per-lesson drafts (nothing is saved).
  | { type: "lesson_start"; lesson_id: number; title: string; index: number; total: number }
  | { type: "lesson_draft"; lesson_id: number; draft: LessonDraft }
  | { type: "regen_lesson_failed"; lesson_id: number; error: string }
  | { type: "regen_done" };

/**
 * Open the streaming generation route and yield its events as they arrive.
 * Non-2xx responses throw the same ApiError / SourceGenerationError shapes the
 * synchronous route throws, because source intake happens before the first byte.
 */
export async function* streamCourseGeneration(
  sources: SourceInput[],
  init?: { signal?: AbortSignal },
): AsyncGenerator<GenerationStreamEvent> {
  const res = await localizedFetch(`${BASE_URL}/courses/generate/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sources }),
    signal: init?.signal,
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // Non-JSON body, so the status has to carry the meaning on its own.
    }
    const detail = (body as { detail?: unknown } | null)?.detail;
    if (
      detail &&
      typeof detail === "object" &&
      (detail as { error?: unknown }).error === "source_failed" &&
      Array.isArray((detail as { sources?: unknown }).sources)
    ) {
      const failed = detail as { message?: string; sources: SourceFailure[] };
      throw new SourceGenerationError(
        res.status,
        createTranslator(browserLocale())(failed.message || "Some of your sources could not be read."),
        failed.sources,
      );
    }
    const fallback = res.statusText || `Request failed with status ${res.status}`;
    throw new ApiError(
      res.status,
      messageFromErrorBody(body, fallback, COST_LIMIT_CONSEQUENCE.generate),
    );
  }
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const buffer = "";
  let kind = "";
  let data = "";
  const flush = function* (): Generator<GenerationStreamEvent> {
    if (kind) {
      try {
        yield { type: kind, ...JSON.parse(data) } as GenerationStreamEvent;
      } catch {
        // A truncated frame is dropped; the stream's own error/done event
        // still tells the client how the run ended.
      }
    }
    kind = "";
    data = "";
  };
  yield* readSseEvents(reader, decoder, buffer, kind, data, flush);
}

/** Read SSE frames from an open response body. Shared by both generation streams. */
async function* readSseEvents(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  buffer: string,
  kind: string,
  data: string,
  flush: () => Generator<GenerationStreamEvent>,
): AsyncGenerator<GenerationStreamEvent> {
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
      if (line.startsWith("event:")) kind = line.slice(6).trim();
      else if (line.startsWith("data:")) data += (data ? "\n" : "") + line.slice(5).replace(/^\s/, "");
      else if (line === "") yield* flush();
    }
  }
  yield* flush();
}

/**
 * Regenerate an unsatisfactory course with the learner's feedback, as the same
 * event stream the generate route emits, so GenerationProgress renders both.
 */
export interface LessonDraft {
  title: string;
  content: string;
  concepts: string[];
}

export type LessonRegenEvent =
  | { type: "regen_started"; lesson_id: number; title: string }
  | { type: "regen_draft"; lesson_id: number; draft: LessonDraft }
  | { type: "regen_done" }
  | { type: "error"; error: string; message?: string };

/**
 * Regenerate one lesson as an SSE stream. The draft is NOT saved; the caller
 * previews it and the learner adopts or discards it.
 */
export async function* streamLessonRegeneration(
  lessonId: number,
  feedback: string,
  init?: { signal?: AbortSignal },
): AsyncGenerator<LessonRegenEvent> {
  const res = await localizedFetch(`/api/lessons/${lessonId}/regenerate/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feedback }),
    signal: init?.signal,
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // Non-JSON body, so the status has to carry the meaning on its own.
    }
    const fallback = res.statusText || `Request failed with status ${res.status}`;
    throw new ApiError(
      res.status,
      messageFromErrorBody(body, fallback, COST_LIMIT_CONSEQUENCE.generate),
    );
  }
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let kind = "";
  let data = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
      if (line.startsWith("event:")) kind = line.slice(6).trim();
      else if (line.startsWith("data:")) data += (data ? "\n" : "") + line.slice(5).replace(/^\s/, "");
      else if (line === "" && kind) {
        try {
          yield { type: kind, ...JSON.parse(data) } as LessonRegenEvent;
        } catch {
          // Truncated frame; the stream's own error/done still reports the outcome.
        }
        kind = "";
        data = "";
      }
    }
  }
}

export async function* streamCourseRegeneration(
  courseId: number,
  feedback: string,
  init?: { signal?: AbortSignal },
): AsyncGenerator<GenerationStreamEvent> {
  const res = await localizedFetch(`${BASE_URL}/api/courses/${courseId}/regenerate/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feedback }),
    signal: init?.signal,
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // Non-JSON body, so the status has to carry the meaning on its own.
    }
    const fallback = res.statusText || `Request failed with status ${res.status}`;
    throw new ApiError(
      res.status,
      messageFromErrorBody(body, fallback, COST_LIMIT_CONSEQUENCE.generate),
    );
  }
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const buffer = "";
  let kind = "";
  let data = "";
  const flush = function* (): Generator<GenerationStreamEvent> {
    if (kind) {
      try {
        yield { type: kind, ...JSON.parse(data) } as GenerationStreamEvent;
      } catch {
        // A truncated frame is dropped; the stream's own error/done event
        // still tells the client how the run ended.
      }
    }
    kind = "";
    data = "";
  };
  yield* readSseEvents(reader, decoder, buffer, kind, data, flush);
}

export interface QuizBankItem {
  id: number;
  question: string;
  kind: string;
  options: string[];
  concept: string;
  attempt_state: QuizItem["attempt_state"];
  solution: string | null;
}

export interface Job {
  id: string;
  type: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  progress: {
    stage?: string;
    done?: number;
    total?: number;
    outline?: { title: string; modules: { title: string; lessons: { title: string }[] }[] };
    drafts?: { lesson_id: number; title: string; draft?: unknown; error?: string }[];
    current?: string;
  } | null;
  result: Record<string, unknown> | null;
  error: string | null;
  ref_type: string | null;
  ref_id: number | null;
  created_at: string;
  updated_at: string;
}

export function startCourseGenerateJob(sources: unknown[]): Promise<{ job_id: string }> {
  return postJson("/courses/generate/job", { sources });
}

export function startCourseRegenJob(
  courseId: number,
  feedback: string,
): Promise<{ job_id: string }> {
  return postJson(`/api/courses/${courseId}/regenerate/job`, { feedback });
}

export function startLessonRegenJob(
  lessonId: number,
  feedback: string,
): Promise<{ job_id: string }> {
  return postJson(`/api/lessons/${lessonId}/regenerate/job`, { feedback });
}

export function startQuizGenerateJob(
  courseId: number,
  items: { kind: string; count: number }[],
  lessonId?: number,
  prompt?: string,
): Promise<{ job_id: string }> {
  return postJson(`/api/courses/${courseId}/quiz/generate/job`, {
    items,
    lesson_id: lessonId,
    prompt,
  });
}

export function getJob(jobId: string): Promise<Job> {
  return request(`/api/jobs/${jobId}`);
}

export function listJobs(status?: string): Promise<{ items: Job[]; total: number }> {
  return request(`/api/jobs${status ? `?status=${status}` : ""}`);
}

export function cancelJob(jobId: string): Promise<Job> {
  return postJson(`/api/jobs/${jobId}/cancel`, {});
}

export function generateQuestionSolution(
  itemId: number,
  refresh = false,
): Promise<{ item_id: number; solution: string }> {
  return postJson(`/api/quiz/${itemId}/solution${refresh ? "?refresh=true" : ""}`, {});
}

export function startQuestionSolutionJob(itemId: number): Promise<{ job_id: string }> {
  return postJson(`/api/quiz/${itemId}/solution/job`, {});
}
export interface QuizBankLesson {
  id: number;
  title: string;
  items: QuizBankItem[];
}
export interface QuizBankModule {
  id: number;
  title: string;
  lessons: QuizBankLesson[];
}
export interface QuizBank {
  course_id: number;
  total: number;
  modules: QuizBankModule[];
}
export interface QuizKindCount {
  kind: string;
  count: number;
}

export function getCourseQuiz(courseId: number): Promise<QuizBank> {
  return request(`/api/courses/${courseId}/quiz`);
}

export function generateQuizQuestions(
  courseId: number,
  items: QuizKindCount[],
  lessonId?: number,
): Promise<{ course_id: number; lesson_id: number | null; created: QuizBankItem[] }> {
  return postJson(`/api/courses/${courseId}/quiz/generate`, {
    lesson_id: lessonId ?? null,
    items,
  });
}

/** `elapsedMs` is a soft timing signal; omit it when the measurement is unavailable. */
export function answerQuiz(
  itemId: number,
  answer: string,
  elapsedMs?: number,
): Promise<AnswerResult> {
  const body = elapsedMs === undefined ? { answer } : { answer, elapsed_ms: elapsedMs };
  return postJson(`/quiz/${itemId}/answer`, body);
}

export interface QuizHint {
  level: number;
  hint: string;
}

export function getQuizHint(itemId: number, level: number): Promise<QuizHint> {
  return postJson(`/quiz/${itemId}/hints`, { level });
}

export interface QuizVariant {
  id: number;
  question: string;
  kind: string;
  options: string[];
  concept: string;
}

export function createQuizVariant(courseId: number, itemId: number): Promise<QuizVariant> {
  return postJson(`/api/courses/${courseId}/quiz/${itemId}/variant`, {});
}

export function startQuizVariantJob(
  courseId: number,
  itemId: number,
): Promise<{ job_id: string }> {
  return postJson(`/api/courses/${courseId}/quiz/${itemId}/variant/job`, {});
}

export function completeLesson(id: number): Promise<CompleteResult> {
  return request(`/lessons/${id}/complete`, { method: "POST" });
}

export function uncompleteLesson(id: number): Promise<CompleteResult> {
  return request(`/lessons/${id}/complete`, { method: "DELETE" });
}

export function getReviewToday(locale?: Locale): Promise<ReviewToday> {
  return get("/review/today", locale);
}

export function getReviewQueue(limit?: number, locale?: Locale): Promise<ReviewQueue> {
  const query = limit ? `?limit=${limit}` : "";
  return get(`/review/queue${query}`, locale);
}

/**
 * Record an answer given during a review session. Nothing is scheduled by this:
 * the learner compares their answer with the reference one and then rates, which
 * is what `rateReviewCard` applies. A 409 means this item was already answered in
 * this exposure, which is enforced server-side at one try per item.
 */
export function answerReviewCard(
  cardId: number,
  itemId: number,
  answer: string,
  elapsedMs?: number,
): Promise<ReviewAnswerResult> {
  const body =
    elapsedMs === undefined
      ? { item_id: itemId, answer }
      : { item_id: itemId, answer, elapsed_ms: elapsedMs };
  return postJson(`/review/cards/${cardId}/answer`, body);
}

/**
 * Apply the learner's rating and reschedule the card. `suggestedRating` is passed
 * back so the backend can record whether the learner overrode the derivation.
 */
export function rateReviewCard(
  cardId: number,
  rating: number,
  suggestedRating?: number | null,
  attemptIds?: number[],
): Promise<ReviewRatingResult> {
  return postJson(`/review/cards/${cardId}/rate`, {
    rating,
    suggested_rating: suggestedRating ?? null,
    attempt_ids: attemptIds ?? [],
  });
}

/**
 * What asking for a re-teach came back with.
 *
 * A 409 is not an error here, which is why the conflict is returned rather than
 * thrown. Its four codes do not all mean the same thing, though, and the differences
 * are the whole difficulty:
 *
 * - note_active and cooldown_active carry an explanation to show.
 * - generation_in_progress carries nothing, because another request is still writing
 *   one. Wait for it.
 * - not_flagged carries nothing either, because the concept stopped being one the
 *   learner keeps missing. Say so, kindly.
 *
 * The last two are indistinguishable by payload and opposite in meaning, so a caller
 * must branch on `error` and never on whether `note` arrived. RemediationConflict is
 * a discriminated union to make that the compiler's job.
 *
 * Genuine failures still throw ApiError: 404 unknown card, 402 spend cap reached,
 * 422 no lesson material left to explain from, 502 the model failed.
 */
export type RemediationOutcome =
  | { kind: "note"; note: RemediationNote }
  | { kind: "conflict"; conflict: RemediationConflict };

/** The message logic `request` applies, over a body that has already been read. */
function messageFromErrorBody(
  body: unknown,
  fallback: string,
  costLimitConsequence?: string,
): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return messageFromValidationDetail(detail) ?? fallback;
  if (detail && typeof detail === "object") {
    return messageFromObjectDetail(detail as ObjectDetail, costLimitConsequence) ?? fallback;
  }
  return fallback;
}

/**
 * Re-teach a concept the learner keeps missing. One metered model call, at most one
 * per concept per week; the server refuses with a 409 rather than spending again.
 *
 * Does not go through `request`, which reads the body only to build an error message
 * and would throw the 409 note away.
 */
export async function requestRemediation(cardId: number): Promise<RemediationOutcome> {
  const res = await localizedFetch(`${BASE_URL}/review/cards/${cardId}/remediation`, { method: "POST" });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON body, so the status has to carry the meaning on its own.
  }
  if (res.ok) return { kind: "note", note: body as RemediationNote };
  if (res.status === 409) {
    const detail = (body as { detail?: RemediationConflict } | null)?.detail;
    if (detail && typeof detail.error === "string") return { kind: "conflict", conflict: detail };
  }
  const fallback = res.statusText || `Request failed with status ${res.status}`;
  throw new ApiError(
    res.status,
    messageFromErrorBody(body, fallback, COST_LIMIT_CONSEQUENCE.remediation),
  );
}

/** The concept's current explanation, or null when it has none. Costs nothing. */
export function getRemediation(cardId: number, locale?: Locale): Promise<RemediationNote | null> {
  return get(`/review/cards/${cardId}/remediation`, locale);
}

function practicePath(cardId: number): string {
  return `/review/cards/${cardId}/remediation/practice`;
}

/**
 * Today's practice run for a concept. It describes; it never refuses.
 *
 * Any real card answers 200, including "this concept has no explanation open" and
 * "this concept has no quiz questions": those are facts about the run, carried as
 * status and reason, not errors. Only an unknown card is a 404.
 */
export function getPractice(cardId: number): Promise<PracticeState> {
  return get(practicePath(cardId));
}

/**
 * What submitting one practice answer came back with.
 *
 * A 409 is not an error here, which is why the conflict is returned rather than
 * thrown: each of its four codes carries the run the answer could not join, and
 * redrawing that run is the only useful thing a UI can do about it.
 */
export type PracticeOutcome =
  | { kind: "answer"; answer: PracticeAnswer }
  | { kind: "conflict"; conflict: PracticeConflict };

/**
 * Record one practice answer and get back the run that follows it.
 *
 * Does not go through `request`, for the same reason requestRemediation does not:
 * `request` reads the body only to build an error message and would throw the 409's
 * `state` away, which is the whole payload the panel needs to redraw itself.
 *
 * A run can also end on a 200 rather than a 409, which is the case worth being careful
 * about. A note retired underneath an open panel terminates the run without discarding
 * the answer the learner was already holding: that answer is still graded and kept, and
 * the terminal state arrives on the response carrying it. Callers must therefore read
 * `state.status` on success too, and never read 200 as "the run continues".
 *
 * Genuine failures still throw ApiError: 404 for an unknown card or item, 400 for an
 * empty answer or an item that tests another concept.
 */
export async function submitPractice(
  cardId: number,
  itemId: number,
  answer: string,
  elapsedMs?: number,
): Promise<PracticeOutcome> {
  const res = await localizedFetch(`${BASE_URL}${practicePath(cardId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      item_id: itemId,
      answer,
      elapsed_ms: elapsedMs === undefined ? null : elapsedMs,
    }),
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON body, so the status has to carry the meaning on its own.
  }
  if (res.ok) return { kind: "answer", answer: body as PracticeAnswer };
  if (res.status === 409) {
    const detail = (body as { detail?: PracticeConflict } | null)?.detail;
    if (detail && typeof detail.error === "string") return { kind: "conflict", conflict: detail };
  }
  const fallback = res.statusText || `Request failed with status ${res.status}`;
  // No spend-cap consequence: practice calls no model, so a 402 cannot reach here.
  throw new ApiError(res.status, messageFromErrorBody(body, fallback));
}

/**
 * One concept's whole conversation with the tutor, oldest first. Costs nothing.
 *
 * `concept_key` travels in the query string rather than in a path segment, which is the
 * server's choice and a load-bearing one: keys keep their slashes and spaces, so
 * "big-o / complexity" is an ordinary key, and a path segment holding a "/" would not
 * route at all. Encoded once, here, so no caller has to remember to.
 *
 * Any key answers 200, an empty conversation included: a concept nobody has asked about
 * is a fact rather than an error, and there is no 404 on this endpoint.
 */
export function getTutorConversation(conceptKey: string): Promise<TutorConversation> {
  return get(`/tutor/conversation?concept_key=${encodeURIComponent(conceptKey)}`);
}

/**
 * What asking the tutor one question came back with.
 *
 * A 409 is not an error here, which is why the conflict is returned rather than thrown.
 * Both of its codes are the learner having run out of turns, and they differ in the one
 * thing the learner will act on: concept_turn_limit means go and ask about something
 * else, daily_turn_limit means stop for today. Nothing in `limits` reliably separates
 * them, so a caller must branch on `error`.
 *
 * Genuine failures still throw ApiError: 422 for an empty or over-long message and for a
 * concept with no material left to answer from, 402 for the spend cap, 502 for a model
 * that failed or replied off-schema.
 */
export type TutorOutcome =
  | { kind: "turn"; turn: TutorTurn }
  | { kind: "conflict"; conflict: TutorConflict };

/**
 * Ask the tutor one question about one concept. One metered model call, two rows.
 *
 * Does not go through `request`, for the same reason requestRemediation does not:
 * `request` reads the body only to build an error message and would throw the payload
 * away. Here that payload is the fresh `limits`, which is the entire subject of the
 * refusal and the only thing that tells the panel what it may still offer.
 *
 * NOTHING IS WRITTEN when this fails, on every failing path: the endpoint builds both
 * rows only after the reply has parsed and commits them together. So a caller may keep
 * the learner's typed text and let them send it again, and the transcript it is holding
 * is still correct.
 *
 * `mode` is required rather than defaulted. The server defaults a missing mode to
 * "answer" and that default is its promise to clients written before guided mode
 * existed; inside this client the two registers are a deliberate choice per question, so
 * a call site that has not said which one it wants is a bug worth a compile error. A
 * value the server does not answer in is a 422 `invalid_mode`, which throws like any
 * other 422, and the union makes that unreachable from here.
 *
 * Asking for "guided" is a REQUEST, not a guarantee. With the concept's guided run
 * already spent the server answers 200 in answer mode instead, and `turn.mode` is how a
 * caller learns which it got.
 */
export async function sendTutorMessage(
  conceptKey: string,
  message: string,
  mode: TutorMode,
): Promise<TutorOutcome> {
  const res = await localizedFetch(`${BASE_URL}/tutor/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ concept_key: conceptKey, message, mode }),
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON body, so the status has to carry the meaning on its own.
  }
  if (res.ok) return { kind: "turn", turn: body as TutorTurn };
  if (res.status === 409) {
    const detail = (body as { detail?: TutorConflict } | null)?.detail;
    if (detail && typeof detail.error === "string") return { kind: "conflict", conflict: detail };
  }
  const fallback = res.statusText || `Request failed with status ${res.status}`;
  throw new ApiError(res.status, messageFromErrorBody(body, fallback, COST_LIMIT_CONSEQUENCE.tutor));
}

/**
 * The course's pace figures. Costs nothing and never refuses.
 *
 * A COURSE WITH NO DEADLINE ANSWERS 200 with a null-deadline shape, not 404: the
 * observed pace is real and worth showing either way, and "no deadline" is a state of
 * this resource rather than the absence of it. Only an unknown course id is a 404.
 *
 * None of the planning endpoints has a 409 carrying a payload, so none of them needs
 * the bespoke fetch that requestRemediation, submitPractice and sendTutorMessage use.
 * They all go through plain get/postJson/putJson, deliberately.
 */
export function getCoursePlan(id: number, locale?: Locale): Promise<CoursePlan> {
  return get(`/courses/${id}/plan`, locale);
}

/**
 * Set or move the deadline, and get the recomputed plan back.
 *
 * THE BODY FIELD IS `deadline`, not `day`, which is the one place this feature's two
 * date-carrying endpoints disagree: a day off posts `{day}`. Sending the wrong one is a
 * generic pydantic 422 rather than this feature's own sentence, so it is worth the note.
 *
 * Today is accepted and the past is not. A past date throws ApiError carrying the
 * server's own message; so does a malformed date or an over-long label.
 */
export function setCourseDeadline(
  id: number,
  deadline: string,
  label: string,
): Promise<CoursePlan> {
  return putJson(`/courses/${id}/deadline`, { deadline, label });
}

/**
 * Remove the deadline. Idempotent, and it touches nothing else: no review card moves
 * and no lesson is un-completed. The course goes back to behaving exactly as one that
 * never had a deadline.
 */
export function clearCourseDeadline(id: number): Promise<CoursePlan> {
  return request(`/courses/${id}/deadline`, { method: "DELETE" });
}

/**
 * Where the deadline's calendar file lives, as a URL for an ordinary link.
 *
 * A DOWNLOAD, NOT A SUBSCRIPTION. The response is text/calendar with a
 * Content-Disposition attachment header, so following the link saves a file; there is
 * no webcal address to offer, because a calendar provider cannot reach a server running
 * on the learner's own machine. 404 when the course has no deadline, which is why the
 * link is only rendered once one is set.
 */
export function coursePlanIcsUrl(id: number): string {
  return `${BASE_URL}/courses/${id}/plan.ics`;
}

/**
 * What the downloaded calendar file will be called, so the screen can say so.
 *
 * MIRRORS backend/app/ics.py download_filename, which OWNS this shape. Restating it
 * rather than reading it back off the response is safe for the same reason the server
 * hardcodes it: the only variable in the name is an integer primary key. The course
 * title is deliberately not in it, because a title is LLM output and a title in a
 * Content-Disposition header is header injection rather than a badly named file.
 *
 * IT CANNOT BE READ BACK. The download is a plain anchor, so the browser consumes the
 * Content-Disposition header and this code never sees it; there is no response here to
 * derive the name from. So this is a copy, and a copy is what can go stale: two backend
 * tests pin the server side, and nothing at all pins this one. If that function is ever
 * renamed, its docstring points here.
 */
export function coursePlanIcsFilename(id: number): string {
  return `studyforge-course-${id}.ics`;
}

/** Every day the learner has marked off, oldest first. Global, not per course. */
export function listDaysOff(locale?: Locale): Promise<DaysOff> {
  return get("/plan/days-off", locale);
}

/**
 * Mark a day off. IDEMPOTENT: marking an already-marked day returns the existing row
 * unchanged rather than a 409, and does not overwrite its note. Changing a note means
 * unmarking the day and marking it again.
 */
export function addDayOff(day: string, note: string): Promise<DayOff> {
  return postJson("/plan/days-off", { day, note });
}

/**
 * Unmark a day. Succeeds whether or not it was marked; `removed` says which happened.
 *
 * The date travels in the PATH here, unlike the tutor's concept_key, which has to use
 * the query string because a normalized key can contain a slash. A YYYY-MM-DD cannot,
 * so the plainer URL is safe.
 */
export function removeDayOff(day: string): Promise<DayOffRemoval> {
  return request(`/plan/days-off/${encodeURIComponent(day)}`, { method: "DELETE" });
}

export function getUsage(limit?: number, locale?: Locale): Promise<UsageSummary> {
  const query = limit ? `?limit=${limit}` : "";
  return get(`/usage${query}`, locale);
}

export function acknowledgeCostAlert(): Promise<AlertState> {
  return request("/usage/alert/ack", { method: "POST" });
}

export function listProjectResources(projectId: number, locale?: Locale): Promise<ResourceSummary[]> {
  return get(`/api/projects/${projectId}/resources`, locale);
}
export function getResource(resourceId: number, locale?: Locale): Promise<ResourceDetail> {
  return get(`/api/resources/${resourceId}`, locale);
}
export function searchProjectResources(projectId: number, query: string, locale?: Locale): Promise<ResourceSearchResult[]> {
  return get(`/api/projects/${projectId}/resources/search?q=${encodeURIComponent(query)}`, locale);
}
export function addUrlResource(projectId: number, url: string, title?: string): Promise<ResourceDetail> {
  return postJson(`/api/projects/${projectId}/resources/url`, { url, title });
}
export function addTextResource(projectId: number, title: string, content: string, kind: "markdown" | "text" = "markdown"): Promise<ResourceDetail> {
  return postJson(`/api/projects/${projectId}/resources/text`, { title, content, kind });
}
export function deleteProjectResource(projectId: number, resourceId: number): Promise<{ status: string; deleted_permanently: boolean }> {
  return request(`/api/projects/${projectId}/resources/${resourceId}`, { method: "DELETE" });
}

export function listCourseResources(courseId: number, locale?: Locale): Promise<ResourceSummary[]> {
  return get(`/api/courses/${courseId}/resources`, locale);
}
export function addCourseUrlResource(courseId: number, url: string, title?: string): Promise<ResourceDetail> {
  return postJson(`/api/courses/${courseId}/resources/url`, { url, title });
}
export function addCourseTextResource(courseId: number, title: string, content: string, kind: "markdown" | "text" = "markdown"): Promise<ResourceDetail> {
  return postJson(`/api/courses/${courseId}/resources/text`, { title, content, kind });
}
export function deleteCourseResource(courseId: number, resourceId: number): Promise<{ status: string; deleted_permanently: boolean }> {
  return request(`/api/courses/${courseId}/resources/${resourceId}`, { method: "DELETE" });
}
export async function uploadCourseResource(courseId: number, file: File): Promise<ResourceDetail> {
  const form = new FormData();
  form.append("file", file);
  const res = await localizedFetch(`${BASE_URL}/api/courses/${courseId}/resources/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    let msg = `Upload failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.detail?.message) msg = data.detail.message;
    } catch {}
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<ResourceDetail>;
}
export async function uploadProjectResource(projectId: number, file: File): Promise<ResourceDetail> {
  const form = new FormData();
  form.append("file", file);
  const res = await localizedFetch(`${BASE_URL}/api/projects/${projectId}/resources/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    let msg = `Upload failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.detail?.message) msg = data.detail.message;
    } catch {}
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<ResourceDetail>;
}

export interface ListSubmissionsOptions {
  exerciseId?: string;
  limit?: number;
  offset?: number;
}

/**
 * One page of a project's submissions, newest first. Costs nothing.
 *
 * The list endpoint returns summaries rather than full details, so a row can be drawn
 * without every artifact's text: a project with fifty versions should not ship fifty
 * copies of the code to render an index.
 */
export function listProjectSubmissions(
  projectId: number,
  options: ListSubmissionsOptions = {},
  locale?: Locale,
): Promise<SubmissionList> {
  const params = new URLSearchParams();
  if (options.exerciseId) params.set("exercise_id", options.exerciseId);
  params.set("limit", String(options.limit ?? 50));
  params.set("offset", String(options.offset ?? 0));
  return get(`/api/projects/${projectId}/submissions?${params.toString()}`, locale);
}

export function getSubmission(submissionId: number, locale?: Locale): Promise<SubmissionDetail> {
  return get(`/api/submissions/${submissionId}`, locale);
}

/** Paste one version. The server stores it and analyses it; it never runs it. */
export function createSubmission(projectId: number, body: CreateSubmissionPayload): Promise<SubmissionDetail> {
  return postJson(`/api/projects/${projectId}/submissions`, body);
}

/**
 * Upload one version as files. At least one of `codeFile` and `logFile` must be set;
 * the server refuses an empty submission with a 422 whose detail carries a message.
 *
 * Mirrors uploadProjectResource's error handling rather than `request`'s: a 422 here is
 * about one file the learner chose, so its `detail.message` is the sentence to show.
 */
export async function uploadSubmission(
  projectId: number,
  input: UploadSubmissionInput,
): Promise<SubmissionDetail> {
  const form = new FormData();
  if (input.codeFile) form.append("code_file", input.codeFile);
  if (input.logFile) form.append("log_file", input.logFile);
  if (input.exerciseId?.trim()) form.append("exercise_id", input.exerciseId.trim());
  if (input.variantId) form.append("variant_id", String(input.variantId));
  if (input.userNote?.trim()) form.append("user_note", input.userNote.trim());

  const res = await localizedFetch(`${BASE_URL}/api/projects/${projectId}/submissions/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    let message = `Upload failed (${res.status})`;
    let code: string | undefined;
    try {
      const data = await res.json();
      if (typeof data?.detail?.message === "string") message = data.detail.message;
      if (typeof data?.detail?.error === "string") code = data.detail.error;
    } catch {
      // Non-JSON error body - the status has to carry the meaning on its own.
    }
    throw new ApiError(res.status, message, code);
  }
  return res.json() as Promise<SubmissionDetail>;
}

/**
 * Analyse one submission and record the review. `useLlm` asks for the model-assisted
 * pass, which may spend provider quota and may come back `unavailable`; the static pass
 * is free and always available. Neither runs the learner's code.
 */
export function getQuizItem(itemId: number, locale?: Locale): Promise<QuizBankItem> {
  return get(`/api/quiz/${itemId}`, locale);
}

export interface QuestionSubmissionInput {
  code?: string;
  code_filename?: string;
  log_content?: string;
  log_filename?: string;
  user_note?: string;
}

export function createQuestionSubmission(
  itemId: number,
  input: QuestionSubmissionInput,
): Promise<SubmissionDetail> {
  return postJson(`/api/quiz/${itemId}/submissions`, input);
}

export function uploadQuestionSubmission(
  itemId: number,
  form: FormData,
): Promise<SubmissionDetail> {
  return request(`/api/quiz/${itemId}/submissions/upload`, {
    method: "POST",
    body: form,
  });
}

export function listQuestionSubmissions(itemId: number, locale?: Locale): Promise<SubmissionList> {
  return get(`/api/quiz/${itemId}/submissions`, locale);
}

export function triggerCodeReview(submissionId: number, useLlm = false): Promise<CodeReviewSummary> {
  return request(`/api/submissions/${submissionId}/review?use_llm=${useLlm ? "true" : "false"}`, {
    method: "POST",
  });
}

export function startGradeJob(
  itemId: number,
  answer: string,
): Promise<{ job_id: string }> {
  return postJson(`/quiz/${itemId}/answer/job`, { answer });
}

export function startHintJob(
  itemId: number,
  level: number,
): Promise<{ job_id: string }> {
  return postJson(`/quiz/${itemId}/hints/job`, { level });
}

export function startReviewJob(
  submissionId: number,
  useLlm = false,
): Promise<{ job_id: string }> {
  return postJson(
    `/api/submissions/${submissionId}/review/job?use_llm=${useLlm ? "true" : "false"}`,
    {},
  );
}

export function listSubmissionReviews(submissionId: number, locale?: Locale): Promise<CodeReviewSummary[]> {
  return get(`/api/submissions/${submissionId}/reviews`, locale);
}

/** Unlock one rung of the hint ladder. A level the review does not have is a 422. */
export function revealReviewHint(reviewId: number, level: 1 | 2 | 3): Promise<ReviewHint> {
  return postJson(`/api/reviews/${reviewId}/hints`, { level });
}

/**
 * Ask for the reference solution. Deliberately a separate, confirmed action: the
 * response is model output, labelled `ai_generated_unverified`, not an answer key.
 */
export function revealReviewSolution(reviewId: number): Promise<ReferenceSolution> {
  return request(`/api/reviews/${reviewId}/solution`, { method: "POST" });
}

/**
 * Draft a practice variant from one submission. Model-only: there is no static
 * fallback, so a 502 means the model produced nothing usable.
 */
export function createVariant(submissionId: number): Promise<VariantDraft> {
  return request(`/api/submissions/${submissionId}/variant`, { method: "POST" });
}

/** Delete one version, its artifacts and its reviews. Irreversible; confirm first. */
export function deleteSubmission(submissionId: number): Promise<void> {
  return requestNoContent(`/api/submissions/${submissionId}`, { method: "DELETE" });
}

export interface ListSessionsOptions {
  limit?: number;
  offset?: number;
}

/**
 * One page of a project's free-exploration sessions, most recently touched first.
 * Costs nothing.
 *
 * The list endpoint returns summaries with a message count rather than transcripts, so
 * an index of fifty sessions does not ship fifty conversations to render a list.
 */
export function listProjectSessions(
  projectId: number,
  options: ListSessionsOptions = {},
  locale?: Locale,
): Promise<ExploreSessionList> {
  const params = new URLSearchParams();
  params.set("limit", String(options.limit ?? 50));
  params.set("offset", String(options.offset ?? 0));
  return get(`/api/projects/${projectId}/sessions?${params.toString()}`, locale);
}

/**
 * Start an empty session. Nothing is asked and nothing is spent.
 *
 * `mode` is sent explicitly rather than omitted. The server defaults it, but this client
 * only ever creates exploration sessions, and a call site that has not said so is worth
 * a compile error rather than a silent default.
 *
 * A 409 `project_archived` means the project is read-only and no session was written.
 */
export function createProjectSession(
  projectId: number,
  body: CreateSessionPayload = { mode: "explore" },
): Promise<ExploreSession> {
  return postJson(`/api/projects/${projectId}/sessions`, body);
}

/** One session with its whole transcript, oldest first. 404 when the id is unknown. */
export function getExploreSession(sessionId: number, locale?: Locale): Promise<ExploreSessionDetail> {
  return get(`/api/sessions/${sessionId}`, locale);
}

/** Delete one session and every message in it. Irreversible; confirm first. */
export function deleteExploreSession(sessionId: number): Promise<void> {
  return requestNoContent(`/api/sessions/${sessionId}`, { method: "DELETE" });
}

/**
 * Ask one question against this project's own material. One metered model call, two rows.
 *
 * THE FIELD IS `body`, not `message`, which is the one place this endpoint and the
 * tutor's disagree. Sending the wrong one is a generic 422 rather than a sentence about
 * the question, so it is worth naming here.
 *
 * NOTHING IS WRITTEN when this fails, on every failing path: both rows are committed
 * together, and only after the reply has parsed. So a caller may keep the learner's
 * typed text and let them send it again, and a 502 `agent_unavailable` is a retry rather
 * than a lost question. That is the reason the component branches on the code instead of
 * on the message: the server's 502 sentence is the one place the fact is stated, and the
 * screen has to say it too.
 *
 * Other failures throw ApiError: 404 unknown session, 409 project archived, 422 empty
 * message, 402 spend cap, 502 model unavailable or off-schema.
 */
export function askExploreQuestion(sessionId: number, body: string): Promise<ExploreAskResult> {
  return postJson(
    `/api/sessions/${sessionId}/messages`,
    { body },
    COST_LIMIT_CONSEQUENCE.explore,
  );
}

/**
 * Turn one question from this session into a temporary explanation plus one draft
 * exercise. One metered model call.
 *
 * `body` is omitted by every caller that has a question in the transcript already, and
 * the server then uses the last thing the learner asked. Sending an explicit question is
 * possible but is NOT the same act: it is not written to the transcript, so a learner who
 * asked it here alone would find the exercise quoting a question the conversation never
 * shows.
 *
 * NOTHING IS WRITTEN on any failing path, the same two reasons as the endpoint above:
 * both rows commit together after the model answers, and the cap is checked before the
 * provider is called. A 502 `practice_unavailable` is therefore a retry, not a partial
 * save, and the caller may say so.
 *
 * Other failures throw ApiError: 404 unknown session, 409 project archived, 422
 * `nothing_to_practise` (nothing asked yet and no body), 402 spend cap, 502 model
 * unavailable or off-schema.
 */
export function createExplorePractice(
  sessionId: number,
  body?: string,
): Promise<ExplorePracticeResult> {
  return postJson(
    `/api/sessions/${sessionId}/practice`,
    { body: body ?? null },
    COST_LIMIT_CONSEQUENCE.practice,
  );
}

export interface ListKnowledgeOptions {
  status?: KnowledgeStatus;
  kind?: KnowledgeKind;
  /** Only the kinds that must be confirmed before they are presented as settled. */
  core?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * One page of a project's knowledge, most recently changed first. Costs nothing.
 *
 * `core` is sent only when it is true. The server's parameter defaults to false and a
 * `core=false` would mean the same thing, but an absent filter is the honest way to say
 * "no filter": it keeps the URL a reader sees in the address bar equal to the one the
 * page is actually asking for.
 */
export function listProjectKnowledge(
  projectId: number,
  params: ListKnowledgeOptions = {},
  locale?: Locale,
): Promise<KnowledgeList> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.kind) query.set("kind", params.kind);
  if (params.core) query.set("core", "true");
  query.set("limit", String(params.limit ?? 50));
  query.set("offset", String(params.offset ?? 0));
  return get(`/api/projects/${projectId}/knowledge?${query.toString()}`, locale);
}

/** One entry with its body, provenance and relations. 404 when the id is unknown. */
export function getKnowledge(knowledgeId: number, locale?: Locale): Promise<KnowledgeDetail> {
  return get(`/api/knowledge/${knowledgeId}`, locale);
}

/**
 * Edit an entry. Absent fields are left alone, so a caller may send only what changed.
 *
 * THE RESPONSE'S `sent_back_for_review` IS THE POINT. Editing a confirmed entry puts it
 * back into `pending_review`, and the response says so on the one request that caused it.
 * A caller that discards the response and only refreshes shows a badge changing colour
 * with nothing to explain it, which is exactly what the review step exists to prevent.
 */
export function updateKnowledge(
  knowledgeId: number,
  patch: { title?: string; body?: string; kind?: KnowledgeKind; concept_key?: string; expected_updated_at?: string },
  locale?: Locale,
): Promise<KnowledgeDetail> {
  return request(
    `/api/knowledge/${knowledgeId}`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) },
    undefined,
    locale,
  );
}

/**
 * Confirm an entry, which is a separate act from editing it. Idempotent: confirming an
 * already-confirmed entry succeeds and writes nothing that changes what it says.
 */
export function confirmKnowledge(knowledgeId: number, locale?: Locale, expectedUpdatedAt?: string): Promise<KnowledgeDetail> {
  return request(`/api/knowledge/${knowledgeId}/confirm`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: expectedUpdatedAt ? JSON.stringify({ expected_updated_at: expectedUpdatedAt }) : undefined,
  }, undefined, locale);
}

/** Every snapshot of an entry, oldest first, with the versions that matter named. */
export function listKnowledgeRevisions(
  knowledgeId: number,
  locale?: Locale,
): Promise<KnowledgeRevisionList> {
  return get(`/api/knowledge/${knowledgeId}/revisions`, locale);
}

/**
 * One version against the entry as it stands now. `fromVersion` omitted means the server
 * starts from the last version a person confirmed, which is the default the review step
 * wants; naming one is the reader asking a different question.
 */
export function compareKnowledge(
  knowledgeId: number,
  fromVersion?: number,
  locale?: Locale,
): Promise<KnowledgeCompare> {
  const query = fromVersion === undefined ? "" : `?from_version=${fromVersion}`;
  return get(`/api/knowledge/${knowledgeId}/compare${query}`, locale);
}

/** One snapshot's full text, for reading a version on its own. */
export function readKnowledgeRevision(
  knowledgeId: number,
  version: number,
  locale?: Locale,
): Promise<KnowledgeRevisionDetail> {
  return get(`/api/knowledge/${knowledgeId}/revisions/${version}`, locale);
}

export interface ProjectGraphEdge {
  id: number;
  from_type: "course" | "lesson";
  from_id: number;
  to_type: "course" | "lesson";
  to_id: number;
  kind: "contains" | "course_sequence" | "chapter_sequence" | "prerequisite" | "related";
  reason: string;
}

export interface ProjectGraph {
  edges: ProjectGraphEdge[];
  positions: Record<string, { x: number; y: number }>;
}

export function getProjectGraph(projectId: number): Promise<ProjectGraph> {
  return get(`/api/projects/${projectId}/graph`);
}

export function startGraphExtractJob(projectId: number): Promise<{ job_id: string }> {
  return postJson(`/api/projects/${projectId}/graph/extract/job`, {});
}

export interface CourseOutline {
  title: string;
  modules: {
    title: string;
    lessons: { title: string; concepts?: string[] }[];
  }[];
}

export function generateCourseOutline(
  topic: string,
  sources?: { type: string; content: string }[],
  feedback?: string,
): Promise<{ outline: CourseOutline }> {
  return postJson("/api/courses/outline/generate", { topic, sources, feedback });
}

export function reviseCourseOutline(
  outline: CourseOutline,
  feedback: string,
  topic?: string,
): Promise<{ outline: CourseOutline }> {
  return postJson("/api/courses/outline/revise", { outline, feedback, topic });
}
