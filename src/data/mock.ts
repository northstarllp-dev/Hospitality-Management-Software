import type {
  User,
  House,
  Room,
  Customer,
  CatalogueItem,
  Booking,
  Purchase,
} from './types';

/** Seed-only house shape with nested rooms (flattened at seed time). */
export interface SeedHouse extends Omit<House, 'roomCount'> {
  rooms: Omit<Room, 'houseId'>[];
}

export const USERS: User[] = [
  { uid: 'sa1', name: 'Vikram Nair', email: 'vikram@havens.in', password: 'admin123', role: 'superadmin' },
  { uid: 'adm1', name: 'Priya Sharma', email: 'priya@havens.in', password: 'admin123', role: 'admin', assignedHouses: ['h1', 'h2'] },
  { uid: 'adm2', name: 'Rahul Mehta', email: 'rahul@havens.in', password: 'admin123', role: 'admin', assignedHouses: ['h3'] },
  { uid: 'stf1', name: 'Arjun Pillai', email: 'arjun@havens.in', password: 'staff123', role: 'staff', assignedHouse: 'h1', assignedHouses: ['h1'] },
  { uid: 'stf2', name: 'Meena Krishnan', email: 'meena@havens.in', password: 'staff123', role: 'staff', assignedHouse: 'h2', assignedHouses: ['h2'] },
  { uid: 'stf3', name: 'Suresh Babu', email: 'suresh@havens.in', password: 'staff123', role: 'staff', assignedHouse: 'h3', assignedHouses: ['h3'] },
];

export const HOUSES: SeedHouse[] = [
  {
    houseId: 'h1',
    name: 'The Malabar House',
    address: '1/269, Parade Road, Fort Kochi, Kerala 682001',
    description: 'A heritage property nestled in the heart of Fort Kochi, blending colonial charm with modern comfort.',
    coverImage: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&h=400&fit=crop&auto=format',
    rooms: [
      { roomId: 'r1', roomNumber: '101', type: 'Single', rent: 2800, maxOccupancy: 1, currentStatus: 'occupied', floor: 1 },
      { roomId: 'r2', roomNumber: '102', type: 'Single', rent: 2800, maxOccupancy: 1, currentStatus: 'vacant', floor: 1 },
      { roomId: 'r3', roomNumber: '103', type: 'Double', rent: 4200, maxOccupancy: 2, currentStatus: 'occupied', floor: 1 },
      { roomId: 'r4', roomNumber: '104', type: 'Double', rent: 4200, maxOccupancy: 2, currentStatus: 'maintenance', floor: 1 },
      { roomId: 'r5', roomNumber: '201', type: 'Double', rent: 4500, maxOccupancy: 2, currentStatus: 'vacant', floor: 2 },
      { roomId: 'r6', roomNumber: '202', type: 'Deluxe', rent: 6500, maxOccupancy: 3, currentStatus: 'occupied', floor: 2 },
      { roomId: 'r7', roomNumber: '203', type: 'Suite', rent: 9800, maxOccupancy: 4, currentStatus: 'vacant', floor: 2 },
      { roomId: 'r8', roomNumber: '204', type: 'Deluxe', rent: 6500, maxOccupancy: 3, currentStatus: 'vacant', floor: 2 },
    ],
  },
  {
    houseId: 'h2',
    name: 'Nilgiri Retreat',
    address: '42, Club Road, Ooty, Tamil Nadu 643001',
    description: 'A colonial bungalow perched at 7,200 ft in the Nilgiris, surrounded by eucalyptus and tea estates.',
    coverImage: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&h=400&fit=crop&auto=format',
    rooms: [
      { roomId: 'r9', roomNumber: '01', type: 'Double', rent: 5500, maxOccupancy: 2, currentStatus: 'occupied', floor: 1 },
      { roomId: 'r10', roomNumber: '02', type: 'Double', rent: 5500, maxOccupancy: 2, currentStatus: 'vacant', floor: 1 },
      { roomId: 'r11', roomNumber: '03', type: 'Suite', rent: 11000, maxOccupancy: 4, currentStatus: 'vacant', floor: 1 },
      { roomId: 'r12', roomNumber: '04', type: 'Deluxe', rent: 7200, maxOccupancy: 3, currentStatus: 'occupied', floor: 1 },
      { roomId: 'r13', roomNumber: '05', type: 'Single', rent: 3200, maxOccupancy: 1, currentStatus: 'maintenance', floor: 1 },
      { roomId: 'r14', roomNumber: '06', type: 'Deluxe', rent: 7200, maxOccupancy: 3, currentStatus: 'vacant', floor: 1 },
    ],
  },
  {
    houseId: 'h3',
    name: 'Backwater Bungalow',
    address: 'Kumarakom North, Kottayam, Kerala 686563',
    description: 'Stilted cottages on the edge of Vembanad Lake, with private decks over the backwaters.',
    coverImage: 'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800&h=400&fit=crop&auto=format',
    rooms: [
      { roomId: 'r15', roomNumber: 'A1', type: 'Suite', rent: 14500, maxOccupancy: 4, currentStatus: 'occupied', floor: 1 },
      { roomId: 'r16', roomNumber: 'A2', type: 'Suite', rent: 14500, maxOccupancy: 4, currentStatus: 'vacant', floor: 1 },
      { roomId: 'r17', roomNumber: 'B1', type: 'Deluxe', rent: 8800, maxOccupancy: 3, currentStatus: 'occupied', floor: 1 },
      { roomId: 'r18', roomNumber: 'B2', type: 'Deluxe', rent: 8800, maxOccupancy: 3, currentStatus: 'vacant', floor: 1 },
      { roomId: 'r19', roomNumber: 'C1', type: 'Double', rent: 6200, maxOccupancy: 2, currentStatus: 'vacant', floor: 1 },
    ],
  },
  {
    houseId: 'h4',
    name: 'The Rann Haveli',
    address: 'Bhirandiyara Village, Kutch, Gujarat 370415',
    description: 'A mud-walled haveli on the edge of the Great Rann, with rooftop stargazing and salt-flat views.',
    coverImage: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800&h=400&fit=crop&auto=format',
    rooms: [
      { roomId: 'r20', roomNumber: '1', type: 'Double', rent: 4800, maxOccupancy: 2, currentStatus: 'vacant', floor: 1 },
      { roomId: 'r21', roomNumber: '2', type: 'Double', rent: 4800, maxOccupancy: 2, currentStatus: 'occupied', floor: 1 },
      { roomId: 'r22', roomNumber: '3', type: 'Suite', rent: 9200, maxOccupancy: 4, currentStatus: 'vacant', floor: 1 },
      { roomId: 'r23', roomNumber: '4', type: 'Deluxe', rent: 6800, maxOccupancy: 3, currentStatus: 'maintenance', floor: 1 },
      { roomId: 'r24', roomNumber: '5', type: 'Single', rent: 3400, maxOccupancy: 1, currentStatus: 'vacant', floor: 1 },
      { roomId: 'r25', roomNumber: '6', type: 'Deluxe', rent: 6800, maxOccupancy: 3, currentStatus: 'vacant', floor: 1 },
      { roomId: 'r26', roomNumber: '7', type: 'Single', rent: 3400, maxOccupancy: 1, currentStatus: 'occupied', floor: 1 },
    ],
  },
];

export const CUSTOMERS: Customer[] = [
  { customerId: 'c1', name: 'Anjali Menon', phone: '+91 98455 12034', email: 'anjali.menon@gmail.com', idProof: 'Aadhaar - 4521 XXXX 3401', bookingHistory: ['b1', 'b3'] },
  { customerId: 'c2', name: 'Rohan Kapoor', phone: '+91 87654 32100', email: 'rohan.kapoor@outlook.com', idProof: 'Passport - J1234567', bookingHistory: ['b2'] },
  { customerId: 'c3', name: 'Deepa Krishnamurthy', phone: '+91 93456 78901', email: 'deepa.k@gmail.com', idProof: 'Aadhaar - 7834 XXXX 5612', bookingHistory: ['b4'] },
  { customerId: 'c4', name: 'Siddharth Joshi', phone: '+91 77012 34567', email: 'sid.joshi@yahoo.com', idProof: "Driver's License - MH02 20220045123", bookingHistory: ['b5'] },
  { customerId: 'c5', name: 'Nandita Roy', phone: '+91 98765 43210', email: 'nandita.roy@gmail.com', idProof: 'Passport - Z7654321', bookingHistory: ['b6'] },
  { customerId: 'c6', name: 'Arvind Patel', phone: '+91 91234 56789', email: 'arvind.p@gmail.com', idProof: 'Aadhaar - 1234 XXXX 5678', bookingHistory: [] },
];

export const CATALOGUE_TEMPLATE: Omit<CatalogueItem, "houseId" | "itemId">[] = [
  { name: 'Mineral Water (1L)', price: 50, category: 'Beverages' },
  { name: 'Fresh Lime Soda', price: 80, category: 'Beverages' },
  { name: 'Masala Chai', price: 60, category: 'Beverages' },
  { name: 'Cold Coffee', price: 120, category: 'Beverages' },
  { name: 'Club Breakfast (2 pax)', price: 380, category: 'Food' },
  { name: 'Room Service Dinner', price: 550, category: 'Food' },
  { name: 'Extra Towel Set', price: 100, category: 'Amenities' },
  { name: 'Toiletries Kit', price: 150, category: 'Amenities' },
  { name: 'Laundry — Per Piece', price: 80, category: 'Laundry' },
  { name: 'Laundry — Express (5 pcs)', price: 500, category: 'Laundry' },
  { name: 'Airport Transfer', price: 850, category: 'Other' },
  { name: 'Boat Ride (1hr)', price: 1200, category: 'Other' },
];

const TEMPLATE_KEYS = [
  'i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7', 'i8', 'i9', 'i10', 'i11', 'i12',
] as const;

export function catalogueForHouse(houseId: string): CatalogueItem[] {
  return CATALOGUE_TEMPLATE.map((item, idx) => ({
    ...item,
    houseId,
    itemId: `${houseId}-${TEMPLATE_KEYS[idx]}`,
  }));
}

/** All house catalogues (for seeding). */
export const CATALOGUE: CatalogueItem[] = HOUSES.flatMap((h) => catalogueForHouse(h.houseId));

function houseItemId(houseId: string, legacyKey: string) {
  return `${houseId}-${legacyKey}`;
}

type SeedBooking = Booking & { purchases: Purchase[] };

export const BOOKINGS: SeedBooking[] = [
  {
    bookingId: 'b1',
    houseId: 'h1',
    roomId: 'r1',
    customerId: 'c1',
    checkIn: '2026-08-04',
    checkOut: '2026-08-08',
    status: 'checked-in',
    rent: 2800,
    purchases: [
      { purchaseId: 'p1', bookingId: 'b1', roomId: 'r1', itemId: houseItemId('h1', 'i1'), quantity: 3, price: 50, addedBy: 'stf1', timestamp: '2026-08-04T14:00:00' },
      { purchaseId: 'p2', bookingId: 'b1', roomId: 'r1', itemId: houseItemId('h1', 'i5'), quantity: 2, price: 380, addedBy: 'stf1', timestamp: '2026-08-05T08:30:00' },
      { purchaseId: 'p3', bookingId: 'b1', roomId: 'r1', itemId: houseItemId('h1', 'i3'), quantity: 4, price: 60, addedBy: 'stf1', timestamp: '2026-08-05T16:00:00' },
    ],
  },
  {
    bookingId: 'b2',
    houseId: 'h1',
    roomId: 'r3',
    customerId: 'c2',
    checkIn: '2026-08-03',
    checkOut: '2026-08-07',
    status: 'checked-in',
    rent: 4200,
    purchases: [
      { purchaseId: 'p4', bookingId: 'b2', roomId: 'r3', itemId: houseItemId('h1', 'i5'), quantity: 2, price: 380, addedBy: 'stf1', timestamp: '2026-08-03T09:00:00' },
      { purchaseId: 'p5', bookingId: 'b2', roomId: 'r3', itemId: houseItemId('h1', 'i9'), quantity: 5, price: 80, addedBy: 'stf1', timestamp: '2026-08-04T11:00:00' },
    ],
  },
  {
    bookingId: 'b3',
    houseId: 'h2',
    roomId: 'r9',
    customerId: 'c1',
    checkIn: '2026-08-01',
    checkOut: '2026-08-05',
    status: 'checked-out',
    rent: 5500,
    purchases: [
      { purchaseId: 'p6', bookingId: 'b3', roomId: 'r9', itemId: houseItemId('h2', 'i8'), quantity: 1, price: 150, addedBy: 'stf2', timestamp: '2026-08-01T15:00:00' },
    ],
  },
  {
    bookingId: 'b4',
    houseId: 'h2',
    roomId: 'r12',
    customerId: 'c3',
    checkIn: '2026-08-05',
    checkOut: '2026-08-09',
    status: 'checked-in',
    rent: 7200,
    purchases: [
      { purchaseId: 'p7', bookingId: 'b4', roomId: 'r12', itemId: houseItemId('h2', 'i12'), quantity: 2, price: 1200, addedBy: 'stf2', timestamp: '2026-08-06T10:00:00' },
    ],
  },
  {
    bookingId: 'b5',
    houseId: 'h3',
    roomId: 'r15',
    customerId: 'c4',
    checkIn: '2026-08-04',
    checkOut: '2026-08-10',
    status: 'checked-in',
    rent: 14500,
    purchases: [
      { purchaseId: 'p8', bookingId: 'b5', roomId: 'r15', itemId: houseItemId('h3', 'i11'), quantity: 2, price: 850, addedBy: 'stf3', timestamp: '2026-08-04T12:00:00' },
      { purchaseId: 'p9', bookingId: 'b5', roomId: 'r15', itemId: houseItemId('h3', 'i6'), quantity: 1, price: 550, addedBy: 'stf3', timestamp: '2026-08-05T20:00:00' },
    ],
  },
  {
    bookingId: 'b6',
    houseId: 'h1',
    roomId: 'r6',
    customerId: 'c5',
    checkIn: '2026-08-06',
    checkOut: '2026-08-12',
    status: 'confirmed',
    rent: 6500,
    purchases: [],
  },
  {
    bookingId: 'b7',
    houseId: 'h4',
    roomId: 'r21',
    customerId: 'c6',
    checkIn: '2026-08-05',
    checkOut: '2026-08-08',
    status: 'checked-in',
    rent: 4800,
    purchases: [
      { purchaseId: 'p10', bookingId: 'b7', roomId: 'r21', itemId: houseItemId('h4', 'i5'), quantity: 3, price: 380, addedBy: 'adm1', timestamp: '2026-08-05T09:00:00' },
    ],
  },
];

export const PURCHASES: Purchase[] = BOOKINGS.flatMap((b) => b.purchases);
