"use client";
import { useAuth } from "@/components/AuthProvider";
import { useRouter, useSearchParams } from "next/navigation";
import Staff from "@/views/Staff";
import { Suspense, useEffect } from "react";
import { canManageTeam } from "@/lib/permissions";

function StaffPageInner() {
  const { currentUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const company = searchParams.get("company") || "";

  useEffect(() => {
    if (!currentUser) {
      router.push("/login");
      return;
    }
    if (!canManageTeam(currentUser)) {
      router.push("/");
    }
  }, [currentUser, router]);

  if (!currentUser || !canManageTeam(currentUser)) return null;

  return <Staff currentUser={currentUser} initialCompanyFilter={company} />;
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading…</div>}>
      <StaffPageInner />
    </Suspense>
  );
}
