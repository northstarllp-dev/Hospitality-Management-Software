import type { Booking, Room } from "@/data/types";

/** True if [start, end) date ranges overlap (YYYY-MM-DD). */
export function datesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

const BLOCKING: Booking["status"][] = ["confirmed", "checked-in"];

export function getConflictingBooking(
  roomId: string,
  checkIn: string,
  checkOut: string,
  bookings: Booking[],
  excludeBookingId?: string
): Booking | undefined {
  return bookings.find(
    (b) =>
      b.roomId === roomId &&
      BLOCKING.includes(b.status) &&
      b.bookingId !== excludeBookingId &&
      datesOverlap(checkIn, checkOut, b.checkIn, b.checkOut)
  );
}

export function roomHasConflict(
  roomId: string,
  checkIn: string,
  checkOut: string,
  bookings: Booking[],
  excludeBookingId?: string
): boolean {
  return !!getConflictingBooking(roomId, checkIn, checkOut, bookings, excludeBookingId);
}

export type RoomAvailability = "available" | "occupied" | "maintenance";

export function getRoomAvailability(
  room: Room,
  checkIn: string,
  checkOut: string,
  bookings: Booking[]
): RoomAvailability {
  if (room.currentStatus === "maintenance") return "maintenance";
  if (!checkIn || !checkOut) {
    return room.currentStatus === "occupied" ? "occupied" : "available";
  }
  if (roomHasConflict(room.roomId, checkIn, checkOut, bookings)) return "occupied";
  return "available";
}

export function getAvailableRooms(
  rooms: Room[],
  checkIn: string,
  checkOut: string,
  bookings: Booking[]
): Room[] {
  return rooms.filter(
    (r) => getRoomAvailability(r, checkIn, checkOut, bookings) === "available"
  );
}
