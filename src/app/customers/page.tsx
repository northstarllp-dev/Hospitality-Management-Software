"use client";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import Customers from "@/views/Customers";
import { useEffect } from "react";
import { appNavigate } from "@/lib/navigate";
import { canViewAllGuests } from "@/lib/permissions";

export default function Page() {
  const { currentUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!currentUser) {
      router.push("/login");
      return;
    }
    if (!canViewAllGuests(currentUser)) {
      router.replace("/");
    }
  }, [currentUser, router]);

  if (!currentUser || !canViewAllGuests(currentUser)) return null;

  return (
    <Customers
      currentUser={currentUser}
      onNavigate={(page, params) => appNavigate(router, page, params)}
    />
  );
}
