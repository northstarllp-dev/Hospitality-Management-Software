"use client";

import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import Login from "@/views/Login";
import { useEffect } from "react";

export default function Page() {
  const { currentUser, setCurrentUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (currentUser) {
      router.replace("/");
    }
  }, [currentUser, router]);

  if (currentUser) {
    return (
      <div className="flex h-screen items-center justify-center text-sm" style={{ color: "var(--muted-foreground)" }}>
        Redirecting…
      </div>
    );
  }

  return (
    <Login
      onLogin={(u) => {
        setCurrentUser(u);
        router.replace("/");
      }}
    />
  );
}
