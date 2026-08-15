"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { User } from "@/data/types";
import { useRouter, usePathname } from "next/navigation";
import { auth, db } from "@/lib/firebase/config";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { normalizeRole } from "@/lib/permissions";

interface AuthContextType {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function toAppUser(data: Record<string, unknown>, uid: string): User {
  const { password: _password, ...safe } = data as unknown as User & { password?: string };
  return {
    ...safe,
    uid,
    role: normalizeRole(safe.role),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const isPublicRoute = pathname?.startsWith("/bill") || pathname === "/login";

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Prefer Auth UID document; fall back to email lookup for legacy docs
          const byUid = await getDoc(doc(db, "users", firebaseUser.uid));
          if (byUid.exists()) {
            setCurrentUser(toAppUser(byUid.data() as Record<string, unknown>, firebaseUser.uid));
          } else {
            const q = query(collection(db, "users"), where("email", "==", firebaseUser.email));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
              setCurrentUser(toAppUser(querySnapshot.docs[0].data() as Record<string, unknown>, firebaseUser.uid));
            } else {
              setCurrentUser(null);
            }
          }
        } catch (e) {
          console.error("Error fetching user data:", e);
          setCurrentUser(null);
        }
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    await signOut(auth);
    setCurrentUser(null);
    router.push("/login");
  };

  if (loading && !isPublicRoute) {
    return <div className="flex h-screen items-center justify-center bg-[#111827] text-white">Loading...</div>;
  }

  return (
    <AuthContext.Provider value={{ currentUser, setCurrentUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
