"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isTokenValid } from "@/lib/auth";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = localStorage.getItem("arbitex_token");
    const valid = isTokenValid(token);
    if (token && !valid) localStorage.removeItem("arbitex_token");

    if (pathname === "/login") {
      if (valid) router.replace("/");
      return;
    }

    if (!valid) router.replace("/login");
  }, [pathname, router]);

  return children;
}

