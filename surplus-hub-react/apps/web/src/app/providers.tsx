"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { configureApiClient } from "@repo/core";
import { AuthProvider } from "../contexts/AuthContext";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production" ? "" : "http://localhost:8000");


configureApiClient({
  baseUrl: API_BASE_URL,
  // Native auth: read the JWT the AuthContext stored in localStorage.
  tokenProvider: () => {
    try {
      if (typeof localStorage === "undefined") return null;
      return localStorage.getItem("access_token");
    } catch {
      return null;
    }
  },
});


type ProvidersProps = {
  children?: unknown;
};

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    // Workspace currently installs multiple React type versions; cast keeps app typing unblocked.
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children as any}</AuthProvider>
    </QueryClientProvider>
  );
}
