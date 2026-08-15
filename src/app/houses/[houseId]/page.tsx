"use client";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import HouseDetail from "@/views/HouseDetail";
import { useEffect, use } from "react";
import { appNavigate } from "@/lib/navigate";
import { canAccessHouse } from "@/lib/permissions";

export default function Page({ params: paramsPromise }: { params: Promise<{ houseId: string }> }) {
  const { currentUser } = useAuth();
  const router = useRouter();
  const params = use(paramsPromise);

  useEffect(() => {
    if (!currentUser) {
      router.push("/login");
      return;
    }
    if (!canAccessHouse(currentUser, params.houseId)) {
      router.replace("/houses");
    }
  }, [currentUser, params.houseId, router]);

  if (!currentUser) return null;
  if (!canAccessHouse(currentUser, params.houseId)) {
    return (
      <div className="p-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
        You do not have access to this property.
      </div>
    );
  }

  return (
    <HouseDetail
      currentUser={currentUser}
      houseId={params.houseId}
      onNavigate={(page, p) => appNavigate(router, page, p)}
    />
  );
}
