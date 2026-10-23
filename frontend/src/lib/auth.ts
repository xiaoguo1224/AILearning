export const ACCESS_COOKIE = "studyforge_access";
export const REFRESH_COOKIE = "studyforge_refresh";

export function safeReturnPath(value: string | null | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return "/projects";
  const path = value.split(/[?#]/)[0];
  if (path === "/login" || path.startsWith("/backend") || path.startsWith("/api")) return "/projects";
  return value;
}
