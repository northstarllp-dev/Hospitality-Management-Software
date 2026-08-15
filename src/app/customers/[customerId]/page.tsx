"use client";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import CustomerDetail from "@/views/CustomerDetail";
import { useEffect, use } from "react";
import { appNavigate } from "@/lib/navigate";
import { canViewAllGuests } from "@/lib/permissions";

export default function Page({ params: paramsPromise }: { params: Promise<{ customerId: string }> }) {
  const { currentUser } = useAuth();
  const router = useRouter();
  const params = use(paramsPromise);

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
    <CustomerDetail
      currentUser={currentUser}
      customerId={params.customerId}
      onNavigate={(page, p) => appNavigate(router, page, p)}
    />
  );
}
