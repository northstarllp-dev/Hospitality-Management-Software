"use client";

import { useRouter } from "next/navigation";

/** Shared portal actions — place on the same row as the page title. */
export default function PortalActions() {
  const router = useRouter();

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <button
        type="button"
        onClick={() => router.push("/bookings/new")}
        className="px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold"
        style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
      >
        New Booking
      </button>
      <button
        type="button"
        onClick={() => router.push("/catalogue")}
        className="px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold"
        style={{ background: "var(--accent)", color: "white" }}
      >
        Purchases
      </button>
    </div>
  );
}
