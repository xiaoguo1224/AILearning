"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/LocaleProvider";
import { LessonMarkdown } from "@/components/LessonMarkdown";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ApiError, askExploreQuestion, createExplorePractice } from "@/lib/api";
import type { Translator } from "@/lib/i18n";
import type { ExploreMessage, ExploreSourceRef, VariantDraft } from "@/lib/types";

/**
 * The two register headings and the sentence between them.
 *
 * The design's claim is that the boundary between what this project's files say and what
 * the model merely knows lives in the SCHEMA, not in prose the model was asked to write:
 * the server sends `body` and `beyond` as separate fields, and these strings are what
 * turns that split into something a learner can see. Fold `beyond` into the answer's
 * paragraph, or drop the disclaimer, and the schema is still split while the screen is
 * not, which is the whole guarantee gone with nothing failing.
 *
 * "this project's material", never "the document" and never "the source": the project
 * holds several files, and a citation names which one it came from.
 */
const GROUNDED_HEADING = "From this project's material";
const BEYOND_HEADING = "Not in this project's material";
const BEYOND_DISCLAIMER =
  "This project's material does not cover this. What follows is general knowledge and " +
  "has not been checked against your files.";

/** `[S1] paper.pdf · p.2`, with the separator dropped when the chunker gave no locator. */
function refLabel(ref: ExploreSourceRef): string {
  return ref.locator
    ? `[${ref.marker}] ${ref.filename} · ${ref.locator}`
    : `[${ref.marker}] ${ref.filename}`;
}

/**
 * The failure, in the one wording that says whether the question survived.
 *
 * A 502 is the case worth branching on: the endpoint writes neither row when the model
 * fails, so the typed question is still in the box and sending it again is the right
 * move. The server says so in its own sentence, but that sentence is English on the
 * wire, and this screen is Chinese for most learners, so the fact is restated here from
 * the code rather than translated out of a string this file does not own.
 */
function askError(err: unknown, t: Translator): string {
  if (err instanceof ApiError) {
    if (err.code === "agent_unavailable") {
      return t("The model did not answer. Your question was not saved, so you can send it again.");
    }
    return err.message;
  }
  return t("Could not reach the server. Is the backend running?");
}

/**
 * The practice failure, in the wording that says whether anything survived.
 *
 * Same reasoning as `askError`, with one addition: the 502 case is worth naming here
 * because it is the difference between "the exercise was lost" and "the exercise was
 * never written", and only the second one makes pressing the button again the right move.
 * `nothing_to_practise` should be unreachable while the button is hidden, but it is a
 * code the server can send and a silent fall-through to its English sentence would be
 * worse than one line here.
 */
function practiceErrorText(err: unknown, t: Translator): string {
  if (err instanceof ApiError) {
    if (err.code === "practice_unavailable") {
      return t("The model did not return a usable exercise. Nothing was saved, so you can try again.");
    }
    if (err.code === "nothing_to_practise") {
      return t("Ask a question in this session first, then generate practice.");
    }
    return err.message;
  }
  return t("Could not reach the server. Is the backend running?");
}

/** One citation chip. Objective on purpose: the filename and the position, nothing more. */
function SourceRefList({ refs }: { refs: ExploreSourceRef[] }) {
  const { t } = useI18n();
  if (refs.length === 0) return null;
  return (
    <ul aria-label={t("Cited sources")} className="mt-3 flex flex-wrap gap-2">
      {refs.map((ref) => (
        <li key={`${ref.marker}-${ref.chunk_id}`}>
          <span className="inline-flex items-center rounded-control border border-line bg-surface-sunken px-2 py-0.5 font-mono text-micro text-ink-muted">
            {refLabel(ref)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * One reply, split into the registers the server sent it in.
 *
 * `body` and `beyond` are two blocks that do not look alike, and the difference is
 * carried three ways: by their headings, by their borders, and by the disclaimer. Never
 * by colour alone, because the reader who most needs to know which half is unchecked is
 * the one who cannot see a hue change.
 *
 * `check_question` sits last, below `beyond`, because it is a question about the whole
 * reply rather than the end of one of its parts.
 */
function AssistantReply({ message }: { message: ExploreMessage }) {
  const { t } = useI18n();
  const headingId = useId();

  return (
    <div role="region" aria-labelledby={headingId} className="flex flex-col gap-3">
      {/* The region needs a name of its own, and neither register heading can be it:
          calling the whole reply "From this project's material" would label the
          ungrounded half as grounded at exactly the moment a screen reader user is being
          told where they landed. */}
      <h4 id={headingId} className="sr-only">
        {t("Answer")}
      </h4>

      <div className="rounded-surface border border-line px-4 py-3">
        <p className="text-micro uppercase tracking-wide text-ink-muted">
          {t(GROUNDED_HEADING)}
        </p>
        {/* Through LessonMarkdown, which runs react-markdown without rehype-raw: this is
            model output derived from uploaded files, so raw HTML in it stays escaped
            text. No title to strip, and passing one could eat a first line that only
            happened to match it. */}
        <div className="mt-2 text-ui">
          <LessonMarkdown content={message.body} title="" />
        </div>
        <SourceRefList refs={message.source_refs} />
        {/* `grounded` is the server's answer to "did this reply cite anything", sent
            rather than counted from the refs above so the two can never disagree. */}
        {!message.grounded && (
          <p className="mt-3 text-small text-ink-muted">
            {t("This answer does not cite this project's material.")}
          </p>
        )}
      </div>

      {message.beyond && (
        /* A DIFFERENT block, never a paragraph appended to the one above. Dashed and
           recessed where the grounded half is solid and on the page surface, so the two
           do not read as one card that happens to have a subheading in it. */
        <div className="rounded-surface border border-dashed border-line-strong bg-surface-sunken px-4 py-3">
          <p className="text-micro uppercase tracking-wide text-ink-muted">
            {t(BEYOND_HEADING)}
          </p>
          <p className="mt-1.5 text-small text-ink-muted">{t(BEYOND_DISCLAIMER)}</p>
          <div className="mt-2 text-ui">
            <LessonMarkdown content={message.beyond} title="" />
          </div>
        </div>
      )}

      {message.check_question && (
        <div className="rounded-surface border border-line px-4 py-2.5">
          <p className="text-micro uppercase tracking-wide text-ink-muted">
            {t("Think about it")}
          </p>
          {/* Plain text, not markdown. It is one question, and a text node is escaped by
              React on its own, which is the least this untrusted string can be given. */}
          <p className="mt-1.5 text-ui text-ink">{message.check_question}</p>
        </div>
      )}
    </div>
  );
}

/**
 * The draft exercise one practice request produced, under the reply that introduced it.
 *
 * The disclaimer is not a variant of the `beyond` sentence: it says a different thing
 * about a different artefact. The reply above may be grounded in the project's files;
 * the exercise below is model output that no person has read and that the server has
 * never executed. So nothing on this card may call it checked, verified or tested, and
 * the link is an offer to try it rather than a claim that it is worth trying.
 *
 * The heading carries the label rather than the exercise title alone: the title is model
 * output and may be anything, so naming the region after it would leave a screen reader
 * user without the one fact that matters, that this is a practice exercise and not
 * another answer.
 */
function PracticeCard({ exercise, projectId }: { exercise: VariantDraft; projectId: number }) {
  const { t } = useI18n();
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="mt-3 space-y-2 rounded-surface border border-line-strong px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warning">{t("Draft, unreviewed")}</Badge>
        <h5 id={headingId} className="text-ui font-medium text-ink">
          {t("Practice exercise: {0}", exercise.title)}
        </h5>
      </div>
      <p className="whitespace-pre-wrap text-ui text-ink">{exercise.prompt}</p>
      {/* Omitted rather than rendered empty: the server may send no starter at all, and
          an empty <pre> reads as a rendering fault. */}
      {exercise.starter_code && (
        <pre className="overflow-x-auto rounded-control bg-surface-sunken p-3 font-mono text-small text-ink">
          {exercise.starter_code}
        </pre>
      )}
      {exercise.acceptance && (
        <p className="text-small text-ink-muted">{t("Acceptance: {0}", exercise.acceptance)}</p>
      )}
      <p className="text-small text-ink-muted">
        {t("This exercise is a model draft. It has not been reviewed, and the server has not run it.")}
      </p>
      <Link
        href={`/projects/${projectId}/submissions?variant=${exercise.id}`}
        className="text-small text-accent underline"
      >
        {t("Submit code for this exercise")}
      </Link>
    </section>
  );
}

/** One thing the learner asked, as it sits in the transcript. */
function QuestionMessage({ text }: { text: string }) {
  const { t } = useI18n();
  return (
    <div className="rounded-surface border border-line bg-surface-sunken px-4 py-2.5">
      <p className="text-micro uppercase tracking-wide text-ink-muted">{t("You asked")}</p>
      {/* A text node, so whatever was typed is escaped rather than parsed. */}
      <p className="mt-1 whitespace-pre-wrap text-ui text-ink">{text}</p>
    </div>
  );
}

/**
 * A conversation about one project's own material, with follow-up questions.
 *
 * The transcript is held here and appended to, because the endpoint hands back only the
 * two rows it wrote; no second copy of the conversation comes back to disagree with the
 * one on screen.
 *
 * Nothing here is an assessment. The only rows it writes are two messages per question:
 * no schedule, no mastery state and no knowledge entry moves because a learner asked
 * something.
 *
 * The draft exercises live in `practices`, keyed by the reply that introduced them.
 * The server sends one back on every read as `message.exercise`, so the cards are seeded
 * from `initialMessages` as well as from a fresh request: an exercise that only existed
 * in memory would be unreachable after a reload, which is the one thing a learner would
 * notice. Keying by message id also lets one session hold several exercises without any
 * card replacing another.
 */
export function ExploreChat({
  sessionId,
  projectId,
  initialMessages,
  readOnly,
  initialQuestion,
}: {
  sessionId: number;
  /** Only used to build the submission link, which is project-scoped. */
  projectId: number;
  /** The transcript the server already rendered, oldest first. */
  initialMessages: ExploreMessage[];
  /** An archived project is read-only: the transcript still reads, the box does not. */
  readOnly: boolean;
  initialQuestion?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [messages, setMessages] = useState<ExploreMessage[]>(initialMessages);
  const [draft, setDraft] = useState(initialMessages.length === 0 ? initialQuestion ?? "" : "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [practicing, setPracticing] = useState(false);
  const [practiceError, setPracticeError] = useState<string | null>(null);
  const [practices, setPractices] = useState<Record<number, VariantDraft>>(() =>
    Object.fromEntries(
      initialMessages
        .filter((message) => message.exercise)
        .map((message) => [message.id, message.exercise as VariantDraft]),
    ),
  );
  /**
   * What the live region says, in one short sentence.
   *
   * A reply is far too long to announce and its markdown would be read as punctuation,
   * so this says that one arrived and whether it has an ungrounded half. That last fact
   * is worth carrying because it is the one thing about a reply that changes how to read
   * it, and it is built from what is on screen rather than from what was asked for.
   */
  const [announcement, setAnnouncement] = useState("");

  const baseId = useId();
  const composerId = `${baseId}-question`;

  async function send() {
    if (sending) return;
    const question = draft.trim();
    if (!question) {
      // Announced as well as shown: focus never leaves the box on this path, and a
      // paragraph appearing next to where you already are is not an event.
      const empty = t("Type a question first.");
      setError(empty);
      setAnnouncement(empty);
      return;
    }
    const firstQuestion = messages.length === 0;
    setSending(true);
    setError(null);
    setAnnouncement(t("Sending your question."));
    try {
      const result = await askExploreQuestion(sessionId, question);
      setMessages((current) => [...current, result.user, result.assistant]);
      // Cleared only here: the box is emptied when the question is actually in the
      // transcript above it, and on no other path.
      setDraft("");
      setAnnouncement(
        result.assistant.beyond
          ? t("The answer is ready. It includes a part that is not from this project's material.")
          : t("The answer is ready."),
      );
      // The server takes the title from the first question, so the session list above
      // this conversation is stale until the page re-renders. Asked for once, on the
      // first question, rather than after every follow-up.
      if (firstQuestion) router.refresh();
    } catch (err) {
      const message = askError(err, t);
      setError(message);
      setAnnouncement(message);
      // The question is STILL IN THE BOX. A 502 writes nothing at all, the learner's own
      // message included, and a 422 never reached the model, so the text they typed is
      // the only copy in existence.
    } finally {
      setSending(false);
    }
  }

  /**
   * Ask for one draft exercise built from the conversation so far.
   *
   * No question is sent: the server takes the last thing the learner actually asked, so
   * the exercise always matches a question visible above it. Typing a fresh question
   * here would produce an exercise quoting something the transcript never shows.
   */
  async function generatePractice() {
    if (practicing) return;
    setPracticing(true);
    setPracticeError(null);
    setAnnouncement(t("Generating a practice exercise."));
    try {
      const result = await createExplorePractice(sessionId);
      setMessages((current) => [...current, result.message]);
      setPractices((current) => ({
        ...current,
        [result.message.id]: result.message.exercise ?? result.exercise,
      }));
      setAnnouncement(
        t("The practice exercise is ready. It is a model draft and has not been reviewed."),
      );
    } catch (err) {
      const message = practiceErrorText(err, t);
      setPracticeError(message);
      setAnnouncement(message);
      // The draft in the box is untouched. This request never used it, and clearing it
      // would throw away text the learner was still writing.
    } finally {
      setPracticing(false);
    }
  }

  const headingId = `${baseId}-heading`;
  const hasQuestion = messages.some((message) => message.role === "user");

  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <div className="space-y-1">
        <h2 id={headingId} className="text-title">
          {t("Conversation")}
        </h2>
        {/* The register contract, said once and before the first reply, so the two
            headings below are not the first the learner hears of it. */}
        <p className="text-small text-ink-muted">
          {t("Answers come from this project's material. Anything the model adds from outside it is kept under its own heading.")}
        </p>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {messages.length === 0 ? (
        <p className="text-small text-ink-muted">
          {t("No messages yet. Ask a question about this project's material to start.")}
        </p>
      ) : (
        <ol className="flex flex-col gap-4">
          {messages.map((message) => (
            <li key={message.id}>
              {message.role === "user" ? (
                <QuestionMessage text={message.body} />
              ) : (
                <>
                  <AssistantReply message={message} />
                  {practices[message.id] && (
                    <PracticeCard exercise={practices[message.id]} projectId={projectId} />
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
      )}

      {readOnly ? (
        <p className="text-small text-ink-muted">
          {t("This project is archived, so free exploration is read-only.")}
        </p>
      ) : (
        <div>
          <label htmlFor={composerId} className="sr-only">
            {t("Ask about this project's material")}
          </label>
          {/* Never disabled, mid-request included: disabling the focused control blurs
              it to the body, and a second send is already refused by the handler and by
              the button beneath it. */}
          <textarea
            id={composerId}
            rows={3}
            value={draft}
            aria-invalid={error ? true : undefined}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter inserts a newline, because a question can be a paragraph. The
              // shortcut is the modifier, and the hint below says so.
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder={t("Ask another question…")}
            className="w-full resize-y rounded-control border border-line bg-transparent px-3 py-2 text-ui text-ink outline-none focus:border-line-hover"
          />

          {error && <p className="mt-2 text-small text-danger">{error}</p>}

          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            {/* A real `disabled` while a question is in flight: it is what stops a
                double-click buying two answers, since the endpoint takes no lock. */}
            <Button type="button" onClick={() => void send()} disabled={sending}>
              {sending ? t("Sending…") : t("Send")}
            </Button>
            <p className="text-micro text-ink-muted">{t("Ctrl or Cmd and Enter sends.")}</p>
            {/* Offered only once there is a question to build from: the endpoint would
                answer 422 otherwise, and a button whose only outcome is an error is
                worse than no button. Hidden on an archived project with the rest of the
                composer, since nothing may be written there. */}
            {hasQuestion && (
              <Button
                type="button"
                variant="secondary"
                className="ml-auto"
                disabled={practicing}
                onClick={() => void generatePractice()}
              >
                {practicing ? t("Generating…") : t("Generate practice")}
              </Button>
            )}
          </div>

          {practiceError && <p className="mt-2 text-small text-danger">{practiceError}</p>}
        </div>
      )}
    </section>
  );
}
