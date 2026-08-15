"use client";

import { useState, useEffect } from "react";
import {
  collection,
  collectionGroup,
  doc,
  onSnapshot,
  query,
  where,
  DocumentData,
  updateDoc,
  setDoc,
} from "firebase/firestore";
import { db } from "./config";
import type { Purchase, Room, RoomStatus } from "@/data/types";

/** Subscribe to an entire collection with real-time updates */
export function useCollection<T = DocumentData>(collectionName: string) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, collectionName));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
        setLoading(false);
      },
      (err) => {
        console.error(`Error fetching ${collectionName}:`, err);
        setError(err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [collectionName]);

  return { data, loading, error };
}

/** Subscribe to a single document with real-time updates */
export function useDocument<T = DocumentData>(collectionName: string, docId: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!docId) {
      setLoading(false);
      return;
    }
    const ref = doc(db, collectionName, docId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setData({ id: snap.id, ...snap.data() } as T);
        } else {
          setData(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error(`Error fetching ${collectionName}/${docId}:`, err);
        setError(err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [collectionName, docId]);

  return { data, loading, error };
}

/** Subscribe to rooms under a house */
export function useHouseRooms(houseId: string | null) {
  const [data, setData] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!houseId) {
      setData([]);
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      collection(db, "houses", houseId, "rooms"),
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as Room));
        setLoading(false);
      },
      (err) => {
        console.error(`Error fetching rooms for ${houseId}:`, err);
        setError(err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [houseId]);

  return { data, loading, error };
}

/** Subscribe to purchases for a booking */
export function usePurchasesByBooking(bookingId: string | null) {
  const [data, setData] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookingId) {
      setData([]);
      setLoading(false);
      return;
    }
    const q = query(collection(db, "purchases"), where("bookingId", "==", bookingId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as Purchase));
        setLoading(false);
      },
      (err) => {
        console.error(`Error fetching purchases for ${bookingId}:`, err);
        setError(err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [bookingId]);

  return { data, loading, error };
}

/** Subscribe to all rooms across houses (collection group) */
export function useAllRooms() {
  const [data, setData] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collectionGroup(db, "rooms"),
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as Room));
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching all rooms:", err);
        setError(err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  return { data, loading, error };
}

export async function setRoomStatus(
  houseId: string,
  roomId: string,
  currentStatus: RoomStatus
) {
  await updateDoc(doc(db, "houses", houseId, "rooms", roomId), { currentStatus });
}

export async function upsertRoom(room: Room) {
  await setDoc(doc(db, "houses", room.houseId, "rooms", room.roomId), room);
}
