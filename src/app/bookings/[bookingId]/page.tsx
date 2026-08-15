"use client";
import { useAuth } from "@/components/AuthProvider";
import { useRouter, useSearchParams } from "next/navigation";
import BookingDetail from "@/views/BookingDetail";
import { useEffect, use, Suspense } from "react";
import { appNavigate } from "@/lib/navigate";

function BookingDetailPage({ bookingId }: { bookingId: string }) {
  const { currentUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const openAddPurchase = searchParams.get("addPurchase") === "1";

  useEffect(() => {
    if (!currentUser) router.push("/login");
  }, [currentUser, router]);

  if (!currentUser) return null;

  return (
    <BookingDetail
      currentUser={currentUser}
      bookingId={bookingId}
      openAddPurchase={openAddPurchase}
      onNavigate={(page, p) => appNavigate(router, page, p)}
    />
  );
}

export default function Page({ params: paramsPromise }: { params: Promise<{ bookingId: string }> }) {
  const params = use(paramsPromise);
  return (
    <Suspense fallback={<div className="p-8 text-center" style={{ color: "var(--muted-foreground)" }}>Loading…</div>}>
      <BookingDetailPage bookingId={params.bookingId} />
    </Suspense>
  );
}
