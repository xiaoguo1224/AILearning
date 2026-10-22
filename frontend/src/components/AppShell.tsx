"use client";

import { usePathname } from "next/navigation";
import { AppSidebar, MobileTopBar } from "./AppSidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/") return children;

  return (
    <div className="flex min-h-screen items-stretch">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar />
        {children}
      </div>
    </div>
  );
}
