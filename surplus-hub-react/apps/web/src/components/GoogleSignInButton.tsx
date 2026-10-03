"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../contexts/AuthContext";

// OAuth 2.0 Web client ID from Google Cloud Console. When unset, the button is
// not rendered (the email/password form still works).
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GSI_SRC = "https://accounts.google.com/gsi/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GoogleGlobal = any;

export function GoogleSignInButton({ onError }: { onError?: (msg: string) => void }) {
  const router = useRouter();
  const { loginWithGoogle } = useAuth();
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!CLIENT_ID || !divRef.current) return;
    let cancelled = false;

    const init = () => {
      const g: GoogleGlobal = (window as unknown as { google?: GoogleGlobal }).google;
      if (cancelled || !g?.accounts?.id || !divRef.current) return;
      g.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: async (resp: { credential?: string }) => {
          if (!resp?.credential) return;
          try {
            await loginWithGoogle(resp.credential);
            router.push("/");
          } catch {
            onError?.("Google 로그인에 실패했습니다. 다시 시도해주세요.");
          }
        },
      });
      g.accounts.id.renderButton(divRef.current, {
        theme: "outline",
        size: "large",
        width: 320,
        text: "continue_with",
        locale: "ko",
      });
    };

    let script = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    const ready = (window as unknown as { google?: GoogleGlobal }).google?.accounts?.id;
    if (script && ready) {
      init();
    } else {
      if (!script) {
        script = document.createElement("script");
        script.src = GSI_SRC;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", init);
    }
    return () => {
      cancelled = true;
      script?.removeEventListener("load", init);
    };
  }, [loginWithGoogle, router, onError]);

  if (!CLIENT_ID) return null;

  return (
    <div className="mt-6">
      <div className="relative mb-4 flex items-center">
        <div className="flex-1 border-t border-border" />
        <span className="px-3 text-xs text-muted-foreground">또는</span>
        <div className="flex-1 border-t border-border" />
      </div>
      <div ref={divRef} className="flex justify-center" />
    </div>
  );
}
