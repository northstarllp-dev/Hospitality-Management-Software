"use client";

import { useMemo } from "react";
import type { User, House, Booking, Customer, Room } from "@/data/types";
import { useCollection, useAllRooms } from "@/lib/firebase/hooks";
import type { Page } from "@/components/Layout";
import { filterHousesByAccess } from "@/lib/permissions";

interface Props {
  currentUser: User;
  onNavigate: (page: Page, params?: Record<string, string>) => void;
}

/** Pick an active stay to add a guest purchase (not catalogue management). */
export default function GuestPurchases({ currentUser, onNavigate }: Props) {
  const { data: allHouses, loading: housesLoading } = useCollection<House>("houses");
  const { data: BOOKINGS, loading: bookingsLoading } = useCollection<Booking>("bookings");
  const { data: CUSTOMERS } = useCollection<Customer>("customers");
  const { data: allRooms } = useAllRooms();

  const houses = filterHousesByAccess(currentUser, allHouses);
  const houseIds = useMemo(() => new Set(houses.map((h) => h.houseId)), [houses]);

  const activeStays = useMemo(
    () =>
      BOOKINGS.filter(
        (b) =>
          houseIds.has(b.houseId) &&
          (b.status === "checked-in" || b.status === "confirmed")
      ).sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
    [BOOKINGS, houseIds]
  );

  if (housesLoading || bookingsLoading) {
    return (
      <div className="p-8 text-center" style={{ color: "var(--muted-foreground)" }}>
        Loading active stays…
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1
          className="text-3xl mb-1"
          style={{ fontFamily: "DM Serif Display, serif", color: "var(--foreground)" }}
        >
          Add Guest Purchase
        </h1>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Choose a stay to add food, drinks, or amenities the guest bought. This is not catalogue setup.
        </p>
      </div>

      <div
        className="rounded-lg overflow-hidden"
        style={{ background: "var(--card)", border: "1px solid var(--border)" }}
      >
        {activeStays.length === 0 && (
          <div className="px-5 py-12 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
            No active stays right now.{" "}
            <button
              type="button"
              className="underline"
              style={{ color: "var(--accent)" }}
              onClick={() => onNavigate("booking-new")}
            >
              Create a booking
            </button>{" "}
            first, then add purchases after check-in.
          </div>
        )}

        {activeStays.map((booking, i) => {
          const house = houses.find((h) => h.houseId === booking.houseId);
          const room = allRooms.find(
            (r: Room) => r.roomId === booking.roomId && r.houseId === booking.houseId
          );
          const customer = CUSTOMERS.find((c) => c.customerId === booking.customerId);
          return (
            <button
              key={booking.bookingId}
              type="button"
              onClick={() =>
                onNavigate("booking-detail", {
                  bookingId: booking.bookingId,
                  addPurchase: "1",
                })
              }
              className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-[var(--secondary)] transition-colors"
              style={{
                borderBottom:
                  i < activeStays.length - 1 ? "1px solid var(--border)" : "none",
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: "var(--foreground)" }}>
                  {customer?.name ?? "Guest"}
                </div>
                <div className="text-xs mt-0.5 truncate" style={{ color: "var(--muted-foreground)" }}>
                  {house?.name} · Room {room?.roomNumber ?? "—"} · {booking.status.replace("-", " ")}
                </div>
              </div>
              <span className="text-xs font-semibold flex-shrink-0" style={{ color: "var(--accent)" }}>
                Add purchase →
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
