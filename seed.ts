import { initializeApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  collection,
  getDocs,
  writeBatch,
  deleteDoc,
} from "firebase/firestore";
import {
  USERS,
  HOUSES,
  CUSTOMERS,
  CATALOGUE,
  BOOKINGS,
  PURCHASES,
} from "./src/data/mock.ts";
import {
  calcNights,
  type BillSnapshot,
  type CatalogueItem,
} from "./src/data/types.ts";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyDBnA2Hs55dDSzyNdVU-9Hg78bPYF_OAAg",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "hospitality-29ca4.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "hospitality-29ca4",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "hospitality-29ca4.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "972219356991",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "1:972219356991:web:2d309a75c108784a41e58a",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "G-BNNB5CW9CV",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const MOCK_USER_IDS = new Set(["sa1", "adm1", "adm2", "stf1", "stf2", "stf3"]);

async function deleteCollectionDocs(name: string) {
  const snap = await getDocs(collection(db, name));
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db);
    for (const d of docs.slice(i, i + 400)) {
      batch.delete(d.ref);
    }
    await batch.commit();
  }
  console.log(`Cleared ${name}: ${docs.length} docs`);
}

async function ensureAuthUser(email: string, password: string) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    console.log(`Created auth user: ${email}`);
    return cred.user.uid;
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "auth/email-already-in-use") {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      console.log(`Auth user already exists, signed in: ${email}`);
      return cred.user.uid;
    }
    throw e;
  }
}

async function seedUsers() {
  const authUids = new Set<string>();
  const resolved: { email: string; password: string; uid: string; user: (typeof USERS)[number] }[] = [];

  for (const u of USERS) {
    const uid = await ensureAuthUser(u.email, u.password!);
    authUids.add(uid);
    resolved.push({ email: u.email, password: u.password!, uid, user: u });
    await signOut(auth);
  }

  // Write all user profiles as superadmin (rules require isSuperAdmin for user writes)
  await signInWithEmailAndPassword(auth, "vikram@havens.in", "admin123");

  for (const r of resolved) {
    await setDoc(doc(db, "users", r.uid), {
      uid: r.uid,
      name: r.user.name,
      email: r.user.email,
      role: r.user.role,
      assignedHouse: r.user.assignedHouse ?? null,
    });
    console.log(`Saved Firestore user: ${r.email} -> ${r.uid}`);
  }

  const usersSnap = await getDocs(collection(db, "users"));
  for (const d of usersSnap.docs) {
    const data = d.data();
    const isLegacyId = MOCK_USER_IDS.has(d.id);
    const hasPassword = Object.prototype.hasOwnProperty.call(data, "password");
    const isOrphanDuplicate = !authUids.has(d.id) && USERS.some((u) => u.email === data.email);
    if (isLegacyId || hasPassword || isOrphanDuplicate) {
      await deleteDoc(d.ref);
      console.log(`Deleted legacy/insecure user doc: ${d.id}`);
    }
  }
}

function buildCheckedOutBill(
  bookingId: string,
  catalogue: CatalogueItem[]
): BillSnapshot | null {
  const booking = BOOKINGS.find((b) => b.bookingId === bookingId);
  if (!booking || booking.status !== "checked-out") return null;
  const house = HOUSES.find((h) => h.houseId === booking.houseId);
  const room = house?.rooms.find((r) => r.roomId === booking.roomId);
  const customer = CUSTOMERS.find((c) => c.customerId === booking.customerId);
  if (!house || !room || !customer) return null;

  const nights = calcNights(booking.checkIn, booking.checkOut);
  const roomTotal = booking.rent * nights;
  const purchaseLines = booking.purchases.map((p) => {
    const item = catalogue.find((c) => c.itemId === p.itemId);
    return {
      label: item?.name ?? p.itemId,
      quantity: p.quantity,
      unitPrice: p.price,
      amount: p.price * p.quantity,
    };
  });
  const purchaseTotal = purchaseLines.reduce((s, l) => s + l.amount, 0);
  const subtotal = roomTotal + purchaseTotal;
  const taxAmount = Math.round(subtotal * 0.12);
  return {
    bookingId,
    houseId: house.houseId,
    houseName: house.name,
    houseAddress: house.address,
    roomNumber: room.roomNumber,
    roomType: room.type,
    customerName: customer.name,
    customerPhone: customer.phone,
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    nights,
    rent: booking.rent,
    roomTotal,
    purchaseLines,
    purchaseTotal,
    subtotal,
    taxAmount,
    totalWithTax: subtotal + taxAmount,
    createdAt: new Date().toISOString(),
  };
}

async function seedCollections() {
  // Clear operational collections (not users — handled above)
  for (const name of ["houses", "customers", "catalogue", "bookings", "purchases", "bills"]) {
    // rooms are under houses — delete house rooms first
    if (name === "houses") {
      const housesSnap = await getDocs(collection(db, "houses"));
      for (const h of housesSnap.docs) {
        const roomsSnap = await getDocs(collection(db, "houses", h.id, "rooms"));
        const batch = writeBatch(db);
        roomsSnap.docs.forEach((r) => batch.delete(r.ref));
        batch.delete(h.ref);
        await batch.commit();
      }
      console.log(`Cleared houses + rooms`);
      continue;
    }
    await deleteCollectionDocs(name);
  }

  let batch = writeBatch(db);
  let ops = 0;
  const flush = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = writeBatch(db);
    ops = 0;
  };
  const set = async (ref: ReturnType<typeof doc>, data: object) => {
    batch.set(ref, data);
    ops += 1;
    if (ops >= 400) await flush();
  };

  for (const h of HOUSES) {
    const { rooms, ...house } = h;
    await set(doc(db, "houses", h.houseId), {
      ...house,
      roomCount: rooms.length,
    });
    for (const r of rooms) {
      await set(doc(db, "houses", h.houseId, "rooms", r.roomId), {
        ...r,
        houseId: h.houseId,
      });
    }
  }

  for (const c of CUSTOMERS) {
    await set(doc(db, "customers", c.customerId), c);
  }
  for (const item of CATALOGUE) {
    await set(doc(db, "catalogue", item.itemId), item);
  }
  for (const b of BOOKINGS) {
    const { purchases: _p, ...booking } = b;
    await set(doc(db, "bookings", b.bookingId), booking);
  }
  for (const p of PURCHASES) {
    await set(doc(db, "purchases", p.purchaseId), p);
  }

  // Pre-seed public bill for already checked-out bookings
  for (const b of BOOKINGS) {
    const bill = buildCheckedOutBill(b.bookingId, CATALOGUE);
    if (bill) {
      await set(doc(db, "bills", b.bookingId), bill);
    }
  }

  await flush();
  console.log(
    `Seeded: houses=${HOUSES.length}, rooms=${HOUSES.reduce((s, h) => s + h.rooms.length, 0)}, customers=${CUSTOMERS.length}, catalogue=${CATALOGUE.length}, bookings=${BOOKINGS.length}, purchases=${PURCHASES.length}`
  );
}

async function seed() {
  console.log("Seeding Firestore and Auth (rooms subcollection + purchases)...");
  // Sign in as superadmin so rules allow writes if already locked down
  await signInWithEmailAndPassword(auth, "vikram@havens.in", "admin123").catch(async () => {
    await createUserWithEmailAndPassword(auth, "vikram@havens.in", "admin123");
  });
  await seedUsers();
  await signInWithEmailAndPassword(auth, "vikram@havens.in", "admin123");
  await seedCollections();
  await signOut(auth);
  console.log("Seed complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
