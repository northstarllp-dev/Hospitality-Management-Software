"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { isSuperAdmin, isStaff, canAddGuestPurchases } from "@/lib/permissions";

/** Shared portal actions — place on the same row as the page title. Role-aware. */
export default function PortalActions() {
  const router = useRouter();
  const { currentUser } = useAuth();

  if (!currentUser) return null;

  if (isSuperAdmin(currentUser)) {
    return (
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
        <button
          type="button"
          onClick={() => router.push("/companies")}
          className="px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
        >
          Companies
        </button>
        <button
          type="button"
          onClick={() => router.push("/staff")}
          className="px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold"
          style={{ background: "var(--accent)", color: "white" }}
        >
          Team
        </button>
        <button
          type="button"
          onClick={() => router.push("/houses")}
          className="px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold"
          style={{ background: "var(--secondary)", color: "var(--secondary-foreground)" }}
        >
          Properties
        </button>
      </div>
    );
  }

  if (isStaff(currentUser)) {
    return (
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
        <button
          type="button"
          onClick={() => router.push("/purchases")}
          className="px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold"
          style={{ background: "var(--accent)", color: "white" }}
        >
          Add Guest Purchase
        </button>
        <button
          type="button"
          onClick={() => router.push("/catalogue")}
          className="px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
        >
          Catalogue
        </button>
        <button
          type="button"
          onClick={() => router.push("/houses")}
          className="px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold"
          style={{ background: "var(--secondary)", color: "var(--secondary-foreground)" }}
        >
          My Property
        </button>
      </div>
    );
  }

  // Property owner (admin)
  return (
    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
      <button
        type="button"
        onClick={() => router.push("/bookings/new")}
        className="px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold"
        style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
      >
        New Booking
      </button>
      {canAddGuestPurchases(currentUser) && (
        <button
          type="button"
          onClick={() => router.push("/purchases")}
          className="px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold"
          style={{ background: "var(--accent)", color: "white" }}
        >
          Add Guest Purchase
        </button>
      )}
    </div>
  );
}
