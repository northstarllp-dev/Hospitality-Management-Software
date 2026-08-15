"use client";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import Staff from "@/views/Staff";
import { useEffect } from "react";
import { canManageStaff } from "@/lib/permissions";

export default function Page() {
  const { currentUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!currentUser) {
      router.push("/login");
      return;
    }
    if (!canManageStaff(currentUser)) {
      router.push("/");
    }
  }, [currentUser, router]);

  if (!currentUser || !canManageStaff(currentUser)) return null;

  return <Staff currentUser={currentUser} />;
}
