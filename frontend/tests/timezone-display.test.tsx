import { describe, expect, test } from "vitest";

import { APP_TIMEZONE, dayKeyOf, formatDateTime, formatDay } from "@/lib/copy";

/**
 * Every clock in this app is the learner's, and the learner is in Beijing.
 *
 * Timestamps arrive as UTC instants (the backend stamps them "+00:00" precisely so this
 * is unambiguous). What these tests pin down is that the RENDERING converts them, and
 * that it does so from a fixed zone rather than from whatever the browser happens to be
 * set to — the server render and the hydrated client render have to agree, and both have
 * to be right for a Beijing learner reading the page.
 *
 * The instants below are chosen so UTC and Beijing disagree about the DATE, which is the
 * only way these assertions can tell a correct conversion from a UTC-pinned one. A
 * timestamp in the middle of the UTC afternoon would pass either way.
 */
describe("timestamps are rendered in Beijing time", () => {
  test("the app pins one zone", () => {
    expect(APP_TIMEZONE).toBe("Asia/Shanghai");
  });

  test("an instant after 16:00 UTC is already the next day in Beijing", () => {
    // 2026-10-23 20:30 UTC is 2026-10-24 04:30 in Beijing.
    expect(dayKeyOf("2026-10-23T20:30:00+00:00")).toBe("2026-10-24");
    expect(formatDay("2026-10-23T20:30:00+00:00", "en")).toBe("24 October 2026");
    expect(formatDay("2026-10-23T20:30:00+00:00", "zh-CN")).toBe("2026年10月24日");
  });

  test("the clock time is converted, not echoed", () => {
    // The jobs list used to print 07:04 for this row: the UTC reading, taken at face
    // value. In Beijing the learner was looking at that job at 15:04.
    const rendered = formatDateTime("2026-10-23T07:04:36+00:00", "zh-CN");
    expect(rendered).toContain("15:04");
    expect(rendered).not.toContain("07:04");
  });

  test("an unreadable value is shown raw rather than as Invalid Date", () => {
    expect(dayKeyOf("not a timestamp")).toBeNull();
    expect(formatDay("not a timestamp", "en")).toBe("not a timestamp");
    expect(formatDateTime("not a timestamp", "en")).toBe("not a timestamp");
  });
});
