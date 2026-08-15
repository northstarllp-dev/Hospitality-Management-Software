"use client";

import { use } from "react";
import Bill from "@/views/Bill";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { appNavigate } from "@/lib/navigate";

export default function PublicBillPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  // Param name kept for route compatibility; value is share token (or legacy booking id).
  const { bookingId: token } = use(params);
  const { currentUser } = useAuth();
  const router = useRouter();

  return (
    <Bill
      token={token}
      allowStaffFallback={!!currentUser}
      onNavigate={
        currentUser
          ? (page, p) => appNavigate(router, page, p)
          : undefined
      }
    />
  );
}
