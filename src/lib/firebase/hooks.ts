"use client";

import { useState, useEffect, useMemo } from "react";
import {
  collection,
  collectionGroup,
  doc,
  documentId,
  onSnapshot,
  query,
  where,
  DocumentData,
  updateDoc,
  setDoc,
} from "firebase/firestore";
import { db } from "./config";
import type { Booking, CatalogueItem, Purchase, Room, RoomStatus, User } from "@/data/types";
import { canViewAllHouses, getAssignedHouseIds } from "@/lib/permissions";

const IN_LIMIT = 30;

function chunkIds(ids: string[], size = IN_LIMIT): string[][] {
  const unique = [...new Set(ids.filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += size) {
    chunks.push(unique.slice(i, i + size));
  }
  return chunks;
}

/** Fill roomId / houseId from Firestore path when missing on the document. */
function mapRoomDoc(d: { id: string; ref: { parent: { parent: { id: string } | null } }; data: () => DocumentData }): Room {
  const data = d.data();
  const pathHouseId = d.ref.parent.parent?.id ?? "";
  return {
    ...(data as Room),
    roomId: (data.roomId as string) || d.id,
    houseId: (data.houseId as string) || pathHouseId,
    roomNumber: String(data.roomNumber ?? ""),
  };
}

/** Subscribe to an entire collection with real-time updates (superadmin / unscoped). */
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

/**
 * House-scoped collection subscription.
 * houseIds === null → full collection (superadmin)
 * houseIds === [] → empty
 * else → where(field, 'in', chunks)
 */
export function useScopedCollection<T = DocumentData>(
  collectionName: string,
  field: string,
  houseIds: string[] | null
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = houseIds === null ? "*" : [...houseIds].sort().join(",");

  useEffect(() => {
    if (houseIds !== null && houseIds.length === 0) {
      setData([]);
      setLoading(false);
      setError(null);
      return;
    }

    if (houseIds === null) {
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
    }

    const chunks = chunkIds(houseIds);
    const maps = new Map<number, T[]>();
    const unsubs: Array<() => void> = [];

    chunks.forEach((chunk, idx) => {
      const q = query(collection(db, collectionName), where(field, "in", chunk));
      const unsub = onSnapshot(
        q,
        (snap) => {
          maps.set(
            idx,
            snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T)
          );
          setData([...maps.values()].flat());
          setLoading(false);
        },
        (err) => {
          console.error(`Error fetching scoped ${collectionName}:`, err);
          setError(err.message);
          setLoading(false);
        }
      );
      unsubs.push(unsub);
    });

    return () => unsubs.forEach((u) => u());
  }, [collectionName, field, key]);

  return { data, loading, error };
}

/** Houses visible to the signed-in user. */
export function useAccessibleHouses<T extends { houseId: string } = DocumentData & { houseId: string }>(
  user: User | null
) {
  const ids = useMemo(() => {
    if (!user) return [] as string[];
    if (canViewAllHouses(user)) return null;
    return getAssignedHouseIds(user);
  }, [user]);

  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = ids === null ? "*" : [...ids].sort().join(",");

  useEffect(() => {
    if (!user) {
      setData([]);
      setLoading(false);
      return;
    }
    if (ids !== null && ids.length === 0) {
      setData([]);
      setLoading(false);
      return;
    }

    if (ids === null) {
      const unsub = onSnapshot(
        collection(db, "houses"),
        (snap) => {
          setData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as T));
          setLoading(false);
        },
        (err) => {
          setError(err.message);
          setLoading(false);
        }
      );
      return () => unsub();
    }

    const chunks = chunkIds(ids);
    const maps = new Map<number, T[]>();
    const unsubs: Array<() => void> = [];
    chunks.forEach((chunk, idx) => {
      const q = query(collection(db, "houses"), where(documentId(), "in", chunk));
      const unsub = onSnapshot(
        q,
        (snap) => {
          maps.set(
            idx,
            snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as T)
          );
          setData([...maps.values()].flat());
          setLoading(false);
        },
        (err) => {
          setError(err.message);
          setLoading(false);
        }
      );
      unsubs.push(unsub);
    });
    return () => unsubs.forEach((u) => u());
  }, [user, key]);

  return { data, loading, error, houseIds: ids };
}

/** Bookings for the user's accessible houses. */
export function useAccessibleBookings(user: User | null) {
  const houseIds = useMemo(() => {
    if (!user) return [] as string[];
    if (canViewAllHouses(user)) return null;
    return getAssignedHouseIds(user);
  }, [user]);
  return useScopedCollection<Booking>("bookings", "houseId", houseIds);
}

/** Catalogue items for accessible houses. */
export function useAccessibleCatalogue(user: User | null) {
  const houseIds = useMemo(() => {
    if (!user) return [] as string[];
    if (canViewAllHouses(user)) return null;
    return getAssignedHouseIds(user);
  }, [user]);
  return useScopedCollection<CatalogueItem>("catalogue", "houseId", houseIds);
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
        setData(snap.docs.map((d) => mapRoomDoc(d)));
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

/** Rooms across accessible houses only. */
export function useAccessibleRooms(user: User | null) {
  const houseIds = useMemo(() => {
    if (!user) return [] as string[];
    if (canViewAllHouses(user)) return null;
    return getAssignedHouseIds(user);
  }, [user]);

  const [data, setData] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = houseIds === null ? "*" : [...houseIds].sort().join(",");

  useEffect(() => {
    if (!user) {
      setData([]);
      setLoading(false);
      return;
    }
    if (houseIds !== null && houseIds.length === 0) {
      setData([]);
      setLoading(false);
      return;
    }

    if (houseIds === null) {
      const unsub = onSnapshot(
        collectionGroup(db, "rooms"),
        (snap) => {
          setData(snap.docs.map((d) => mapRoomDoc(d)));
          setLoading(false);
        },
        (err) => {
          setError(err.message);
          setLoading(false);
        }
      );
      return () => unsub();
    }

    // Prefer per-house subcollection reads (always have path houseId) over collectionGroup
    // filters that miss rooms missing a houseId field on the document.
    const maps = new Map<number, Room[]>();
    const unsubs: Array<() => void> = [];
    houseIds.forEach((hid, idx) => {
      const unsub = onSnapshot(
        collection(db, "houses", hid, "rooms"),
        (snap) => {
          maps.set(idx, snap.docs.map((d) => mapRoomDoc(d)));
          setData([...maps.values()].flat());
          setLoading(false);
        },
        (err) => {
          setError(err.message);
          setLoading(false);
        }
      );
      unsubs.push(unsub);
    });
    return () => unsubs.forEach((u) => u());
  }, [user, key]);

  return { data, loading, error };
}

/** Prefer useAccessibleRooms(user). Kept for superadmin-only screens. */
export function useAllRooms() {
  const [data, setData] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collectionGroup(db, "rooms"),
      (snap) => {
        setData(snap.docs.map((d) => mapRoomDoc(d)));
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
