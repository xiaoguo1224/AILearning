"use client";



import { useI18n } from "@/components/LocaleProvider";
import type { Translator } from "@/lib/i18n";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Callout } from "@/components/ui/Callout";
import { ApiError, answerReviewCard, rateReviewCard } from "@/lib/api";
import type { RatingName, RatingPreview, ReviewCard, ReviewQueue } from "@/lib/types";

/**
 * The four buttons, in rating order, with the colour each carries in the design.
 *
 * The status tokens (danger/warning/success), not raw Tailwind colours: globals.css's
 * comment on `--sf-success`/`--sf-warning`/`--sf-danger` names "the review rating
 * colours" directly as the existing use these tones were already carrying, so this is
 * the one place the token comment is describing.
 */
const RATING_STYLES: Record<RatingName, { title: string; className: string }> = {
  again: { title: "Again", className: "text-danger" },
  hard: { title: "Hard", className: "text-warning" },
  good: { title: "Good", className: "" },
  easy: { title: "Easy", className: "text-success" },
};

/**
 * Byte-identical to courses/page.tsx's constant of the same name, which is in turn
 * Button's BASE + primary + md minus its two `disabled:` utilities, an anchor having no
 * disabled state to style. A Link cannot use Button (it wraps a native <button> only),
 * so the classes are restated, and the two copies are kept in sync BY HAND until
 * a link-flavoured variant of the primitive exists. Keep them identical: two constants
 * sharing a name while rendering different geometry is worse than either shape alone,
 * because the next person to dedupe them silently resizes one set of call sites.
 * Margin is deliberately not in here; it belongs to the layout, not to the button.
 */
const PRIMARY_LINK_CLASSES =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control bg-fill " +
  "px-4 py-2 text-ui font-medium text-on-fill transition-colors duration-fast ease-standard " +
  "hover:bg-fill-hover";

/**
 * What the learner has done with the current card.
 *
 * "rating" is reached either by answering or by a 409, which means this item was
 * already answered earlier in the same exposure. In that case there is no reference
 * answer to show and no attempt to attribute the rating to, but the card is still
 * due and still needs rating, so the buttons stay.
 */
type Phase =
  | { kind: "answering" }
  | {
      kind: "rating";
      submitted: string | null;
      expected: string | null;
      suggested: number | null;
      attemptIds: number[];
      preview: RatingPreview[];
      alreadyAnswered: boolean;
    };

function errorMessage(err: unknown, t: Translator): string {
  return err instanceof ApiError ? err.message : t("Could not reach the server.");
}

export function ReviewSession({ queue, returnHref }: { queue: ReviewQueue; returnHref?: string }) {
  const { t } = useI18n();
  /**
   * The session runs over this snapshot and never refetches. Every answer and every
   * rating is its own durable POST, so ending mid-session and coming back simply
   * pulls a fresh queue of whatever is still due. There is no session to resume.
   *
   * A card whose concept no longer has any quiz item cannot be asked, so it is
   * dropped here rather than rendered as an empty card.
   */
  const [cards] = useState<ReviewCard[]>(() => queue.cards.filter((card) => card.item !== null));
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: "answering" });
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const card = cards[index];
  const item = card?.item ?? null;
  const finished = index >= cards.length;

  /** When the current question rendered, for the elapsed_ms timing signal. */
  const shownAt = useRef<number>(0);
  const ratingRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    shownAt.current = Date.now();
  }, [index]);

  // Put the keyboard on the suggested rating as soon as the buttons appear, so the
  // common case is one keystroke and an override is an arrow key away.
  useEffect(() => {
    if (phase.kind === "rating") ratingRef.current?.focus();
  }, [phase.kind, index]);

  function advance() {
    setPhase({ kind: "answering" });
    setAnswer("");
    setError(null);
    setIndex((prev) => prev + 1);
  }

  async function submitAnswer() {
    if (!card || !item || busy) return;
    if (!answer.trim()) {
      setError(t("Enter an answer first."));
      return;
    }
    const elapsed = Date.now() - shownAt.current;
    setBusy(true);
    setError(null);
    try {
      const result = await answerReviewCard(
        card.card_id,
        item.id,
        answer,
        Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : undefined,
      );
      setPhase({
        kind: "rating",
        submitted: result.submitted,
        expected: result.expected,
        suggested: result.suggested_rating,
        attemptIds: [result.attempt_id],
        // The answer response recomputes the preview at submit time, so prefer it
        // over the one the queue was rendered with.
        preview: result.preview,
        alreadyAnswered: false,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setPhase({
          kind: "rating",
          submitted: answer,
          expected: null,
          suggested: null,
          attemptIds: [],
          preview: card.preview,
          alreadyAnswered: true,
        });
      } else {
        setError(errorMessage(err, t));
      }
    } finally {
      setBusy(false);
    }
  }

  async function rate(rating: number) {
    if (!card || busy || phase.kind !== "rating") return;
    setBusy(true);
    setError(null);
    try {
      await rateReviewCard(card.card_id, rating, phase.suggested, phase.attemptIds);
      advance();
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  const total = cards.length;
  const position = Math.min(index + 1, total);
  const done = finished ? total : index;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  // The queue limit trims what is handed to the client but reschedules nothing, and
  // a card with no question left cannot be asked. Both are said out loud rather than
  // quietly folded into a smaller number.
  const notes: string[] = [];
  if (queue.due_total > queue.cards.length) {
    notes.push(t("{0} due, showing {1}", queue.due_total, queue.cards.length));
  }
  const skipped = queue.cards.length - total;
  if (skipped > 0) {
    notes.push(
      t("{0} skipped: {1} no quiz question left", skipped, skipped === 1 ? "its concept has" : "their concepts have"),
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-surface-sunken">
      <div className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-5 px-6 py-3">
          <Link
            href={returnHref ?? "/"}
            className="text-small font-medium text-ink-muted transition-colors duration-fast ease-standard hover:text-ink"
          >
            {t("End session")}</Link>
          <div
            role="progressbar"
            aria-label={t("Review session progress")}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
            aria-valuetext={t("{0} of {1} cards reviewed", done, total)}
            className="h-1 max-w-[420px] flex-1 overflow-hidden rounded-full bg-line"
          >
            <div
              className="h-full bg-fill transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="whitespace-nowrap font-mono text-small tabular-nums text-ink-muted">
            {total === 0 ? "0 / 0" : `${position} / ${total}`}
          </span>
        </div>
      </div>

      {notes.length > 0 && (
        <p className="mx-auto w-full max-w-4xl px-6 pt-3 text-small text-ink-muted">
          {notes.join(" · ")}
        </p>
      )}

      <div className="mx-auto w-full max-w-[720px] flex-1 px-6 py-14">
        {total === 0 && (
          <div className="rounded-surface border border-line bg-surface p-8 text-center">
            <p className="text-lg font-medium">{t("Nothing to review right now")}</p>
            <p className="mt-1 text-ui text-ink-muted">
              {t(returnHref ? "There is no existing review card or course question for this concept. Read its knowledge entry or practise locally and upload your results." : "Concepts come back as their recall probability drops. Finish a lesson to put new ones into the schedule.")}</p>
            <Link href={returnHref ?? "/"} className={`mt-6 ${PRIMARY_LINK_CLASSES}`}>
              {t(returnHref ? "Back to review suggestions" : "Back to Today")}</Link>
          </div>
        )}

        {total > 0 && finished && (
          <div className="rounded-surface border border-line bg-surface p-8 text-center">
            <p className="text-lg font-medium">{t("Session complete")}</p>
            <p className="mt-1 text-ui text-ink-muted">
              {t(returnHref ? "{0} concepts reviewed. Your self-rating is recorded; it does not certify a code fix." : "{0} concepts reviewed and rescheduled.", total)}{!returnHref && queue.due_total > queue.cards.length &&
                t(" {0} more are still due: start another session when you are ready.", queue.due_total - queue.cards.length)}
            </p>
            <Link href={returnHref ?? "/"} className={`mt-6 ${PRIMARY_LINK_CLASSES}`}>
              {t(returnHref ? "Back to review suggestions" : "Back to Today")}</Link>
          </div>
        )}

        {card && item && !finished && (
          <>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-micro uppercase text-ink-muted">
                {t("Concept")}</span>
              <span className="text-small text-ink">{card.concept_label}</span>
              {card.lapses > 0 && (
                /*
                  Not the Badge primitive, and not `text-micro` either. Badge uppercases
                  its children, which reads correctly for a one-word status but renders
                  this four-word phrase as MISSED LAST TIME, a copy change the restyle
                  was not supposed to make. `text-micro` is the size Badge uses, but the
                  scale comment in globals.css states it is uppercase and tracked out by
                  convention, and its 0.04em tracking is baked into the theme variable,
                  so it is equally wrong for a sentence-case phrase. `text-small` is the
                  nearest size that carries no case convention. Colour and pill geometry
                  stay Badge's so the two still read as siblings.
                */
                <span className="inline-flex items-center rounded-full bg-warning-surface px-2 py-0.5 text-small font-medium text-warning">
                  {t("Missed last time")}</span>
              )}
            </div>

            <div className="mt-3.5 rounded-surface border border-line bg-surface p-8">
              <p className="text-xl font-medium leading-[1.45]">{item.question}</p>

              {phase.kind === "answering" && (
                <div className="mt-6">
                  {item.kind === "mcq" ? (
                    <fieldset className="flex flex-col gap-2">
                      <legend className="sr-only">{t("Choose an answer")}</legend>
                      {item.options.map((option) => (
                        <label key={option} className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name={`review-${card.card_id}`}
                            value={option}
                            checked={answer === option}
                            disabled={busy}
                            onChange={() => setAnswer(option)}
                          />
                          {option}
                        </label>
                      ))}
                    </fieldset>
                  ) : (
                    <>
                      <label htmlFor={`answer-${card.card_id}`} className="sr-only">
                        {t("Your answer")}</label>
                      <input
                        id={`answer-${card.card_id}`}
                        type="text"
                        autoFocus
                        value={answer}
                        disabled={busy}
                        onChange={(e) => setAnswer(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void submitAnswer();
                          }
                        }}
                        placeholder={t("Your answer")}
                        /*
                          No `outline-none` here, deliberately, where the raw version had one:
                          globals.css's app-wide `:focus-visible` rule is unlayered, and Tailwind
                          wraps its own utilities in `@layer utilities`, so an unlayered rule
                          always wins over a layered one regardless of either side's specificity.
                          Removing this utility changes no rendered pixel; it only stops shipping
                          a rule that could never have won.
                        */
                        className="w-full rounded-control border border-line-strong bg-transparent px-3 py-2 text-ui text-ink transition-colors duration-fast ease-standard hover:border-line-hover focus:border-line-hover disabled:opacity-60"
                      />
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => void submitAnswer()}
                    disabled={busy}
                    className="mt-4 rounded-control bg-fill px-5 py-2 text-ui font-medium text-on-fill transition-colors duration-fast ease-standard hover:bg-fill-hover disabled:opacity-60"
                  >
                    {busy ? t("Checking…") : t("Show answer")}
                  </button>
                </div>
              )}

              {/* Mounted unconditionally and left empty while answering. A live region
                  has to be in the accessible tree BEFORE its content arrives: if the
                  attribute and the text appear in the same render, screen readers
                  routinely miss the announcement. That matters here because focus moves
                  to the rating buttons while the reference answer renders above them,
                  and the buttons do not name it. */}
              <div aria-live="polite">
                {phase.kind !== "answering" && (
                  <>
                  {phase.alreadyAnswered ? (
                    <div className="mt-6 border-t border-line pt-5">
                      <Callout tone="warning">
                        {t(returnHref ? "Your answer was already recorded. Rate your recall to finish this review." : "You already answered this question earlier in this review, so it was not recorded again. Rate how well you recalled it and the card will be rescheduled.")}</Callout>
                    </div>
                  ) : (
                    <>
                      <div className="mt-6 border-t border-line pt-5">
                        <p className="mb-2.5 font-mono text-micro uppercase text-ink-muted">
                          {t("Your answer")}</p>
                        <p className="text-ui leading-relaxed text-ink">{phase.submitted}</p>
                      </div>
                      <div className="mt-5 border-t border-line pt-5">
                        <p className="mb-2.5 font-mono text-micro uppercase text-ink-muted">
                          {t("Reference answer")}</p>
                        <p className="text-ui leading-relaxed text-ink-muted">
                          {phase.expected}
                        </p>
                      </div>
                    </>
                  )}
                  </>
                )}
              </div>
            </div>

            {error && (
              <Callout tone="danger" role="alert" className="mt-4">
                {error}
              </Callout>
            )}

            {phase.kind === "rating" && (
              <>
                <p className="mb-3 mt-6 text-center text-small text-ink-muted">
                  {t("How well did you recall it?")}</p>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {phase.preview.map((option, index) => {
                    const style = RATING_STYLES[option.name];
                    const suggested = option.rating === phase.suggested;
                    // Focus the suggested button, or the first one when there is no
                    // suggestion. The 409 path has none (the answer was recorded in an
                    // earlier sitting), and without the fallback nothing holds the ref,
                    // focus falls to the body, and the learner tabs from the top of the
                    // page to reach the only controls left on screen.
                    const takesFocus = phase.suggested === null ? index === 0 : suggested;
                    return (
                      <button
                        key={option.rating}
                        type="button"
                        ref={takesFocus ? ratingRef : undefined}
                        disabled={busy}
                        onClick={() => void rate(option.rating)}
                        aria-label={returnHref ? `${t(style.title)}${suggested ? t(", suggested") : ""}` : t("{0}, next review in {1}{2}", t(style.title), option.label, suggested ? t(", suggested") : "")}
                        className={`rounded-control bg-surface text-center transition-colors duration-fast ease-standard disabled:opacity-60 ${
                          suggested
                            ? "border-2 border-ink px-2.5 py-[13px]"
                            : "border border-line px-2.5 py-3.5 hover:border-line-hover"
                        }`}
                      >
                        <span className={`block text-sm font-semibold ${style.className}`}>
                          {t(style.title)}
                        </span>
                        {/* Rendered verbatim: the server computes it from the real
                            scheduler transition with fuzzing off, so two buttons
                            showing the same label are both telling the truth. */}
                        {!returnHref && <span aria-hidden className="mt-1 block font-mono text-[11px] text-ink-muted">
                          {option.label}
                        </span>}
                      </button>
                    );
                  })}
                </div>
                {/*
                  ink-muted, not ink-subtle, even though this is the most de-emphasised text on
                  the screen. The raw classes were text-zinc-400 dark:text-zinc-500, and the
                  LIGHT value was the bad one: zinc-400 on white measures 2.62:1, a clear AA
                  failure at this size (dark's zinc-500 measured 4.10:1, also under the floor).
                  ink-muted takes them to 7.72:1 light and 7.55:1 dark. Do not "simplify" this
                  to ink-subtle: it is the lower-contrast of the two ink tokens.
                */}
                <p className="mt-4.5 text-center text-xs leading-relaxed text-ink-muted">
                  {returnHref ? t("Rate your actual recall. Review suggestions follow mistakes and your choices.") : <>{t("Intervals come from FSRS using your own history on this concept, and bunch closer together than you might expect.")}<br />{t("Rate honestly: a generous rating today costs you a forgotten concept later.")}</>}</p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
