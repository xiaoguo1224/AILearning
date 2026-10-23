/**
 * Sentences and formatters that two components on the Today screen have to agree on.
 *
 * Small on purpose. Nothing lands here because it is generically useful; things land
 * here because saying the same fact twice, in two wordings, is a bug the learner can
 * see. The re-teach button and the practice panel sit inside the same list row and can
 * both be talking about the same concept at the same moment.
 *
 * A component module would technically do, since ReteachConcept already imports
 * ConceptPractice and there would be no cycle. It is still the wrong home: a component
 * that owns the words another component must say makes the dependency about rendering
 * when it is really about copy, and the next component needing the same sentence has
 * to import a panel to get it.
 */

import { createTranslator, type Locale, type Translator } from "./i18n";

/**
 * The wall clock every timestamp in this app is rendered in: Beijing time.
 *
 * Stored timestamps are UTC, and that part is right — an instant should not depend on
 * where it was written down. What was wrong is that the rendering left the conversion
 * to whoever happened to be looking. `toLocaleString()` with no timeZone reads the
 * BROWSER's zone, so the server render and the client render disagreed by the offset
 * between the host and the viewer, and `timeZone: "UTC"` (what this module used to pin
 * dates to) showed a Beijing learner yesterday's date for anything they did between
 * midnight and 08:00.
 *
 * One constant, applied on both sides, so the string is the same in the HTML and after
 * hydration, and it is the learner's clock either way. Change this line, not the
 * fifteen call sites that used to each pick their own answer.
 */
export const APP_TIMEZONE = "Asia/Shanghai";

/** A date with its time of day, in {@link APP_TIMEZONE}. Raw string if unparseable. */
export function formatDateTime(iso: string, locale: Locale = "en"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(locale === "en" ? "en-GB" : "zh-CN", { timeZone: APP_TIMEZONE });
}

/**
 * The YYYY-MM-DD key of an instant as it falls in {@link APP_TIMEZONE}.
 *
 * NOT `toISOString().slice(0, 10)`, which is the UTC day and therefore a day behind for
 * the first eight hours of a Beijing morning. Used to group a conversation by the day
 * each message was sent, so the wrong key puts a 07:00 message under yesterday.
 */
export function dayKeyOf(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * A fixed locale and a fixed zone, so a date rendered on the server survives hydration
 * unchanged. Falls back to the raw ISO string rather than showing "Invalid Date".
 */
export function formatDay(iso: string, locale: Locale = "en"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(locale === "en" ? "en-GB" : "zh-CN", { day: "numeric", month: "long", year: "numeric", timeZone: APP_TIMEZONE });
}

/**
 * A local YYYY-MM-DD study day as the learner would write it: "25 September 2026".
 *
 * NOT formatDay above, and the difference is a whole day. formatDay takes a full ISO
 * timestamp; handed a bare "2026-09-25" the Date constructor reads it as UTC midnight,
 * and toLocaleDateString then renders it in the browser's zone, which is the 24th
 * anywhere west of Greenwich. The deadline, the finish projection and every day off are
 * bare day keys, so they are pinned to UTC on the way in and on the way out and the
 * date arrives as the one that was stored.
 *
 * The locale is fixed rather than inherited so the server render and the client render
 * produce the same string and hydration does not tear.
 */
export function formatDayKey(key: string, locale: Locale = "en"): string {
  const date = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return key;
  return date.toLocaleDateString(locale === "en" ? "en-GB" : "zh-CN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * That a concept has stopped being one the learner keeps missing, in one wording.
 *
 * Two places reach this fact by different routes: the re-teach button is told
 * `not_flagged` when it asks for an explanation, and the practice panel finds the note
 * retired underneath it. Both are good news and both are the same news, so they get
 * the same clause. A second phrasing would have one list row disagree with itself
 * depending on which control the learner happened to touch.
 *
 * Returned without a trailing stop, so callers can carry the sentence on.
 */
export function noLongerMissed(conceptLabel: string, t: Translator = createTranslator("en")): string {
  return t("{0} is no longer one of the concepts you keep missing", conceptLabel);
}

/**
 * What nothing inside the re-teach panel does, practice and the tutor included. Said ONCE.
 *
 * The one thing a learner might reasonably assume, from asking for an explanation, from
 * getting practice questions right, or from talking a concept through with the tutor, is
 * that they have moved the needle. They have not: re-teaching writes a note, practice
 * writes an attempt row, the tutor writes two message rows, and none of them touches the
 * schedule, the mastery buckets, the attention flag, or the retention figure. That
 * promise is the panel's, not any one control's, which is why it is one sentence at the
 * bottom of the panel rather than one per control: practice used to carry its own
 * wording of it, two lines above this one, and every learner who opened practice read
 * the same fact twice.
 *
 * The tutor was added by WIDENING the clause below rather than by adding a second
 * sentence beside it, for exactly that reason. Two near-identical paragraphs one rule
 * apart is what this constant exists to prevent, and at 390px it costs seven lines to
 * say one thing twice.
 */
export const SCHEDULE_PROMISE =
  "This concept stays in your review queue on its usual schedule. Nothing here, " +
  "practice and the tutor included, reschedules it or marks it learned.";
