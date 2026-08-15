// ─── Type Definitions ─────────────────────────────────────────────────────────
export type Role = 'superadmin' | 'admin' | 'staff';
export type RoomStatus = 'vacant' | 'occupied' | 'maintenance';
export type BookingStatus = 'confirmed' | 'checked-in' | 'checked-out' | 'cancelled';

export interface User {
  uid: string;
  name: string;
  email: string;
  password?: string;
  role: Role;
  assignedHouse?: string | null;
}

export interface Room {
  roomId: string;
  houseId: string;
  roomNumber: string;
  type: 'Single' | 'Double' | 'Suite' | 'Deluxe';
  rent: number;
  /** Base number of people the room accommodates */
  maxOccupancy: number;
  /** Extra beds available beyond base occupancy */
  extraBeds?: number;
  /** Cost charged per extra bed */
  costPerBed?: number;
  currentStatus: RoomStatus;
  floor: number;
}

export interface House {
  houseId: string;
  name: string;
  address: string;
  description: string;
  coverImage: string;
  roomCount?: number;
  /** Owning company (managed by super admin) */
  companyId?: string | null;
}

export interface Company {
  companyId: string;
  name: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  notes?: string;
  createdAt?: string;
}

export interface Customer {
  customerId: string;
  name: string;
  phone: string;
  email: string;
  idProof: string;
  bookingHistory: string[];
}

export interface CatalogueItem {
  itemId: string;
  houseId: string;
  name: string;
  price: number;
  category: 'Beverages' | 'Food' | 'Amenities' | 'Laundry' | 'Other';
}

export interface Purchase {
  purchaseId: string;
  bookingId: string;
  roomId: string;
  itemId: string;
  quantity: number;
  price: number;
  addedBy: string;
  timestamp: string;
}

export interface BookingPayment {
  paymentId: string;
  /** Amount received in ₹ */
  amount: number;
  /** ISO timestamp when payment was recorded */
  paidAt: string;
  /** Optional note e.g. UPI / cash / advance */
  note?: string;
  recordedBy?: string;
}

export interface Booking {
  bookingId: string;
  houseId: string;
  roomId: string;
  customerId: string;
  checkIn: string;
  checkOut: string;
  status: BookingStatus;
  /** Base nightly room rate (before discount) */
  rent: number;
  /** Flat ₹ discount on the room stay total (not per night) */
  discount?: number;
  /** Number of guests staying */
  guestCount?: number;
  /** Extra beds used beyond room maxOccupancy */
  extraBedsUsed?: number;
  /** Nightly rate per extra bed (snapshot at booking) */
  extraBedRate?: number;
  /** Advance / partial payments recorded before or after checkout */
  payments?: BookingPayment[];
  /** Whether the stay bill has been marked paid */
  paid?: boolean;
  paidAt?: string;
  notes?: string;
  /** Present after checkout — used to build guest bill URL */
  shareToken?: string;
}

export interface BillLineItem {
  label: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface BillSnapshot {
  bookingId: string;
  houseId: string;
  houseName: string;
  houseAddress: string;
  roomNumber: string;
  roomType: string;
  customerName: string;
  customerPhone: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  rent: number;
  roomTotal: number;
  discount?: number;
  guestCount?: number;
  extraBedsUsed?: number;
  extraBedRate?: number;
  extraBedTotal?: number;
  purchaseLines: BillLineItem[];
  purchaseTotal: number;
  subtotal: number;
  taxAmount: number;
  totalWithTax: number;
  /** Sum of advance / partial payments applied to this bill */
  amountPaid?: number;
  /** Remaining amount due after payments (never negative) */
  balanceDue?: number;
  payments?: BookingPayment[];
  createdAt: string;
  paid?: boolean;
  paidAt?: string;
  shareToken?: string;
}

// ─── Utility Functions ─────────────────────────────────────────────────────────

export function calcExtraBedsNeeded(
  guestCount: number,
  maxOccupancy: number,
  extraBedsAvailable: number
): number {
  return Math.min(Math.max(0, guestCount - maxOccupancy), Math.max(0, extraBedsAvailable));
}

export function calcExtraBedTotal(
  extraBedsUsed: number,
  extraBedRate: number,
  nights: number
): number {
  return Math.max(0, extraBedsUsed) * Math.max(0, extraBedRate) * Math.max(1, nights);
}

/** Room charge after discount (never negative). */
export function calcRoomCharge(booking: Booking): number {
  const nights = calcNights(booking.checkIn, booking.checkOut);
  const roomTotal = booking.rent * nights;
  const discount = Math.max(0, booking.discount ?? 0);
  return Math.max(0, roomTotal - discount);
}

export function calcBookingTotal(booking: Booking, purchases: Purchase[] = []): number {
  const nights = calcNights(booking.checkIn, booking.checkOut);
  const roomCharge = calcRoomCharge(booking);
  const extraTotal = calcExtraBedTotal(
    booking.extraBedsUsed ?? 0,
    booking.extraBedRate ?? 0,
    nights
  );
  const purchaseTotal = purchases.reduce((sum, p) => sum + p.price * p.quantity, 0);
  return roomCharge + extraTotal + purchaseTotal;
}

export function calcAmountPaid(payments: BookingPayment[] | undefined): number {
  return (payments ?? []).reduce((sum, p) => sum + Math.max(0, p.amount || 0), 0);
}

export function calcTaxAmount(subtotal: number): number {
  return Math.round(Math.max(0, subtotal) * 0.12);
}

export function calcBalanceDue(totalWithTax: number, amountPaid: number): number {
  return Math.max(0, totalWithTax - Math.max(0, amountPaid));
}

export function calcNights(checkIn: string, checkOut: string): number {
  const a = new Date(`${checkIn}T12:00:00`);
  const b = new Date(`${checkOut}T12:00:00`);
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function getActiveBookingForRoom(bookings: Booking[], roomId: string): Booking | undefined {
  return bookings.find(b => b.roomId === roomId && (b.status === 'checked-in' || b.status === 'confirmed'));
}
