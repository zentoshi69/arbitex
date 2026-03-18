"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/login") return;
    const token = localStorage.getItem("arbitex_token");
    if (!token) router.replace("/login");
  }, [pathname, router]);

  return children;
}

