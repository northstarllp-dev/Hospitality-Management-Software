/**
 * Clears guest and booking data from Firestore.
 * Keeps: users, houses, rooms, catalogue.
 * Resets all rooms to vacant (no active guests).
 */
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  getDocs,
  writeBatch,
  doc,
  updateDoc,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyDBnA2Hs55dDSzyNdVU-9Hg78bPYF_OAAg",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "hospitality-29ca4.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "hospitality-29ca4",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "hospitality-29ca4.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "972219356991",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "1:972219356991:web:2d309a75c108784a41e58a",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function deleteCollectionDocs(name: string) {
  const snap = await getDocs(collection(db, name));
  let batch = writeBatch(db);
  let ops = 0;
  let deleted = 0;
  for (const d of snap.docs) {
    batch.delete(d.ref);
    ops += 1;
    deleted += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  console.log(`Cleared ${name}: ${deleted} docs`);
}

async function resetRoomsVacant() {
  const housesSnap = await getDocs(collection(db, "houses"));
  let updated = 0;
  for (const h of housesSnap.docs) {
    const roomsSnap = await getDocs(collection(db, "houses", h.id, "rooms"));
    for (const r of roomsSnap.docs) {
      const status = r.data().currentStatus;
      if (status !== "vacant") {
        await updateDoc(doc(db, "houses", h.id, "rooms", r.id), {
          currentStatus: "vacant",
        });
        updated += 1;
      }
    }
  }
  console.log(`Reset rooms to vacant: ${updated}`);
}

async function main() {
  const email = process.env.SEED_EMAIL ?? "vikram@havens.in";
  const password = process.env.SEED_PASSWORD ?? "admin123";
  console.log(`Signing in as ${email}…`);
  await signInWithEmailAndPassword(auth, email, password);

  for (const name of ["bills", "purchases", "bookings", "customers"]) {
    await deleteCollectionDocs(name);
  }
  await resetRoomsVacant();

  await signOut(auth);
  console.log("Done. Bookings and guests cleared.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
