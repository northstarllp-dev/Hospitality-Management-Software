import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import type { Booking, BillSnapshot, RoomStatus } from "@/data/types";
import { roomHasConflict } from "@/lib/availability";
import { createId, createShareToken } from "@/lib/ids";

const BLOCKING: Booking["status"][] = ["confirmed", "checked-in"];

function todayYmd() {
  return new Date().toISOString().split("T")[0];
}

/** Room is occupied only when a guest is checked-in, or confirmed stay covers today. */
export function deriveRoomStatus(
  roomStatus: RoomStatus,
  roomBookings: Booking[],
  today = todayYmd()
): RoomStatus {
  if (roomStatus === "maintenance") return "maintenance";
  const blocking = roomBookings.filter((b) => BLOCKING.includes(b.status));
  if (blocking.some((b) => b.status === "checked-in")) return "occupied";
  if (blocking.some((b) => b.checkIn <= today && today < b.checkOut)) return "occupied";
  return "vacant";
}

export async function fetchRoomBookings(
  db: Firestore,
  roomId: string,
  houseId?: string
): Promise<Booking[]> {
  const constraints = houseId
    ? [where("houseId", "==", houseId), where("roomId", "==", roomId)]
    : [where("roomId", "==", roomId)];
  const snap = await getDocs(query(collection(db, "bookings"), ...constraints));
  return snap.docs.map((d) => d.data() as Booking);
}

export async function syncRoomOccupancy(
  db: Firestore,
  houseId: string,
  roomId: string,
  currentStatus: RoomStatus
) {
  const bookings = await fetchRoomBookings(db, roomId, houseId);
  const next = deriveRoomStatus(currentStatus, bookings);
  const batch = writeBatch(db);
  batch.update(doc(db, "houses", houseId, "rooms", roomId), { currentStatus: next });
  await batch.commit();
  return next;
}

export interface CreateBookingInput {
  houseId: string;
  roomId: string;
  roomNumber?: string;
  customerId: string;
  checkIn: string;
  checkOut: string;
  rent: number;
  discount?: number;
  guestCount?: number;
  extraBedsUsed?: number;
  extraBedRate?: number;
  notes?: string;
  roomCurrentStatus: RoomStatus;
}

export async function createBookingAtomic(db: Firestore, input: CreateBookingInput) {
  if (input.checkOut <= input.checkIn) {
    throw new Error("Check-out must be after check-in.");
  }

  const existing = await fetchRoomBookings(db, input.roomId, input.houseId);
  if (roomHasConflict(input.roomId, input.checkIn, input.checkOut, existing)) {
    throw new Error("This room is already booked for those dates.");
  }

  const bookingId = createId("b");
  const booking: Booking = {
    bookingId,
    houseId: input.houseId,
    roomId: input.roomId,
    roomNumber: input.roomNumber || undefined,
    customerId: input.customerId,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    status: "confirmed",
    rent: input.rent,
    discount: input.discount ?? 0,
    guestCount: input.guestCount ?? 1,
    extraBedsUsed: input.extraBedsUsed ?? 0,
    extraBedRate: input.extraBedRate ?? 0,
    notes: input.notes ?? "",
    paid: false,
  };

  const allForRoom = [...existing, booking];
  const nextStatus = deriveRoomStatus(input.roomCurrentStatus, allForRoom);

  const batch = writeBatch(db);
  batch.set(doc(db, "bookings", bookingId), booking);
  batch.update(doc(db, "houses", input.houseId, "rooms", input.roomId), {
    currentStatus: nextStatus,
  });
  await batch.commit();

  const { arrayUnion, updateDoc } = await import("firebase/firestore");
  await updateDoc(doc(db, "customers", input.customerId), {
    bookingHistory: arrayUnion(bookingId),
  }).catch(() => {
    /* non-fatal if customer doc missing history field shape */
  });

  return booking;
}

export async function cancelBookingAtomic(
  db: Firestore,
  booking: Booking,
  roomCurrentStatus: RoomStatus
) {
  if (booking.status === "checked-out" || booking.status === "cancelled") {
    throw new Error("This booking can no longer be cancelled.");
  }

  const batch = writeBatch(db);
  batch.update(doc(db, "bookings", booking.bookingId), { status: "cancelled" });
  await batch.commit();

  await syncRoomOccupancy(db, booking.houseId, booking.roomId, roomCurrentStatus);
}

export async function checkInBookingAtomic(
  db: Firestore,
  booking: Booking
) {
  if (booking.status !== "confirmed") {
    throw new Error("Only confirmed bookings can be checked in.");
  }
  const batch = writeBatch(db);
  batch.update(doc(db, "bookings", booking.bookingId), { status: "checked-in" });
  batch.update(doc(db, "houses", booking.houseId, "rooms", booking.roomId), {
    currentStatus: "occupied",
  });
  await batch.commit();
}

export async function checkoutBookingAtomic(
  db: Firestore,
  booking: Booking,
  bill: BillSnapshot,
  roomCurrentStatus: RoomStatus
) {
  if (booking.status !== "checked-in" && booking.status !== "confirmed") {
    throw new Error("Only active stays can be checked out.");
  }

  const shareToken = createShareToken();
  const billWithToken: BillSnapshot & { shareToken: string } = {
    ...bill,
    shareToken,
  };

  const publicBill = {
    ...bill,
    token: shareToken,
    bookingId: booking.bookingId,
  };

  const batch = writeBatch(db);
  batch.set(doc(db, "bills", booking.bookingId), billWithToken);
  batch.set(doc(db, "publicBills", shareToken), publicBill);
  batch.update(doc(db, "bookings", booking.bookingId), {
    status: "checked-out",
    paid: bill.paid ?? false,
    paidAt: bill.paidAt ?? null,
    payments: bill.payments ?? booking.payments ?? [],
    shareToken,
  });
  await batch.commit();

  const remaining = (await fetchRoomBookings(db, booking.roomId, booking.houseId)).map((b) =>
    b.bookingId === booking.bookingId ? { ...b, status: "checked-out" as const } : b
  );
  const next = deriveRoomStatus(roomCurrentStatus, remaining);
  const statusBatch = writeBatch(db);
  statusBatch.update(doc(db, "houses", booking.houseId, "rooms", booking.roomId), {
    currentStatus: next,
  });
  await statusBatch.commit();

  return { shareToken };
}

export interface UpdateBookingInput {
  checkIn: string;
  checkOut: string;
  rent: number;
  discount: number;
  roomCurrentStatus: RoomStatus;
}

export async function updateBookingDatesAtomic(
  db: Firestore,
  booking: Booking,
  input: UpdateBookingInput
) {
  if (booking.status === "checked-out" || booking.status === "cancelled") {
    throw new Error("Cannot modify dates for a past or cancelled booking.");
  }
  if (input.checkOut <= input.checkIn) {
    throw new Error("Check-out must be after check-in.");
  }

  const existing = await fetchRoomBookings(db, booking.roomId, booking.houseId);
  if (roomHasConflict(booking.roomId, input.checkIn, input.checkOut, existing, booking.bookingId)) {
    throw new Error("The room is unavailable for the selected dates.");
  }

  const batch = writeBatch(db);
  batch.update(doc(db, "bookings", booking.bookingId), {
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    rent: input.rent,
    discount: input.discount,
  });
  
  // Re-calculate room status if dates changed
  const updatedBookings = existing.map(b => b.bookingId === booking.bookingId ? {
    ...b,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
  } : b);
  
  const nextStatus = deriveRoomStatus(input.roomCurrentStatus, updatedBookings);
  batch.update(doc(db, "houses", booking.houseId, "rooms", booking.roomId), {
    currentStatus: nextStatus,
  });

  await batch.commit();
}
