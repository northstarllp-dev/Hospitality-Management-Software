"use client";

import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import GuestPurchases from "@/views/GuestPurchases";
import { appNavigate } from "@/lib/navigate";
import { canAddGuestPurchases, isSuperAdmin } from "@/lib/permissions";

export default function PurchasesPage() {
  const { currentUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!currentUser) {
      router.push("/login");
      return;
    }
    if (isSuperAdmin(currentUser) || !canAddGuestPurchases(currentUser)) {
      router.replace("/");
    }
  }, [currentUser, router]);

  if (!currentUser || isSuperAdmin(currentUser) || !canAddGuestPurchases(currentUser)) {
    return null;
  }

  return (
    <GuestPurchases
      currentUser={currentUser}
      onNavigate={(page, p) => appNavigate(router, page, p)}
    />
  );
}
