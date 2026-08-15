"use client";

import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Companies from "@/views/Companies";
import { appNavigate } from "@/lib/navigate";
import { canManageCompanies } from "@/lib/permissions";

export default function CompaniesPage() {
  const { currentUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!currentUser) {
      router.push("/login");
      return;
    }
    if (!canManageCompanies(currentUser)) {
      router.replace("/");
    }
  }, [currentUser, router]);

  if (!currentUser || !canManageCompanies(currentUser)) return null;

  return (
    <Companies
      currentUser={currentUser}
      onNavigate={(page, p) => appNavigate(router, page, p)}
    />
  );
}
