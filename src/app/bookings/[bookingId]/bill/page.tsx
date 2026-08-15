"use client";
import { use } from "react";
import Bill from "@/views/Bill";
import { useRouter } from "next/navigation";
import { appNavigate } from "@/lib/navigate";

export default function Page({ params: paramsPromise }: { params: Promise<{ bookingId: string }> }) {
  const params = use(paramsPromise);
  const router = useRouter();

  return (
    <Bill
      token={params.bookingId}
      allowStaffFallback
      onNavigate={(page, p) => appNavigate(router, page, p)}
    />
  );
}
