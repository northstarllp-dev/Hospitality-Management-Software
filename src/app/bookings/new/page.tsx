"use client";
import { useAuth } from "@/components/AuthProvider";
import { useRouter, useSearchParams } from "next/navigation";
import BookingNew from "@/views/BookingNew";
import { Suspense, useEffect } from "react";
import { appNavigate } from "@/lib/navigate";

function BookingNewInner() {
  const { currentUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!currentUser) router.push("/login");
  }, [currentUser, router]);

  if (!currentUser) return null;

  return (
    <BookingNew
      currentUser={currentUser}
      initialHouseId={searchParams.get("houseId") || undefined}
      initialRoomId={searchParams.get("roomId") || undefined}
      initialCheckIn={searchParams.get("checkIn") || undefined}
      initialCheckOut={searchParams.get("checkOut") || undefined}
      onNavigate={(page, params) => appNavigate(router, page, params)}
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading…</div>}>
      <BookingNewInner />
    </Suspense>
  );
}
