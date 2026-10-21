import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Globals are off, so Testing Library cannot register its own cleanup: without this,
// every render accumulates in one shared document and a getByRole in the second test
// finds two of everything the first test drew.
afterEach(cleanup);

// Server pages are invoked outside Next request scope; preserve their English contract.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "en" }) }),
}));

// Ant Design components need these browser APIs that jsdom doesn't provide.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", MockResizeObserver);

vi.stubGlobal("matchMedia", (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
}));
