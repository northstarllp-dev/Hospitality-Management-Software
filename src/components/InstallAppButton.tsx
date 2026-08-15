"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Variant = "sidebar" | "login";

export default function InstallAppButton({ variant = "sidebar" }: { variant?: Variant }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);

    if (isStandalone) {
      setInstalled(true);
      return;
    }

    const ua = window.navigator.userAgent;
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIosHint(isIOS);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* ignore registration failures in unsupported contexts */
      });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  const canPrompt = Boolean(deferred);

  const onClick = async () => {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setDeferred(null);
      return;
    }
    setShowHelp((v) => !v);
  };

  const label = canPrompt ? "Install as app" : "Download as web app";
  const helpText = iosHint
    ? "Tap Share, then Add to Home Screen."
    : "In your browser menu, choose Install app or Add to Home Screen.";

  if (variant === "login") {
    return (
      <div className="mt-6">
        <button
          type="button"
          onClick={onClick}
          className="w-full rounded-md px-4 py-2.5 text-sm font-medium transition-colors"
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
          }}
        >
          ↓ {label}
        </button>
        {showHelp && (
          <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
            {helpText}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left text-xs px-3 py-2 rounded transition-colors hover:bg-white/10"
        style={{ color: "rgba(255,255,255,0.55)" }}
      >
        ↓ {label}
      </button>
      {showHelp && (
        <p className="px-3 pb-2 text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.35)" }}>
          {helpText}
        </p>
      )}
    </div>
  );
}
