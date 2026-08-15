"use client";
import { useAuth } from "@/components/AuthProvider";
import { useRouter, useSearchParams } from "next/navigation";
import Houses from "@/views/Houses";
import { Suspense, useEffect } from "react";
import { appNavigate } from "@/lib/navigate";

function HousesPageInner() {
  const { currentUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const company = searchParams.get("company") || "";

  useEffect(() => {
    if (!currentUser) router.push("/login");
  }, [currentUser, router]);

  if (!currentUser) return null;

  return (
    <Houses
      currentUser={currentUser}
      initialCompanyFilter={company}
      onNavigate={(page, params) => appNavigate(router, page, params)}
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading…</div>}>
      <HousesPageInner />
    </Suspense>
  );
}
