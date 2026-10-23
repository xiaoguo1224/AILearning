/**
 * The question kinds the bank can generate, in the order the UI lists them.
 *
 * This was a local `const KINDS` in three components plus a hand-written union in
 * types.ts. Splitting "fill" out of "short" is exactly the change that leaves one of
 * those copies behind — a kind the generator can produce but the count form cannot
 * request, or a type that rejects what the API actually returns. One list, one place.
 *
 * Display labels stay as `quiz_kind_<kind>` translation keys, so adding a kind means
 * this array plus one entry in zh-CN.json.
 */
export const QUIZ_KINDS = ["mcq", "fill", "short", "truefalse", "code"] as const;

export type QuizKind = (typeof QUIZ_KINDS)[number];
