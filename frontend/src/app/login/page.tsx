import { LoginForm } from "@/components/LoginForm";
import { safeReturnPath } from "@/lib/auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return <LoginForm next={safeReturnPath((await searchParams).next)} />;
}
