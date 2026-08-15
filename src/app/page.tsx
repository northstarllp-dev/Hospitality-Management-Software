"use client";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import Dashboard from "@/views/Dashboard";
import { useEffect } from "react";
import { appNavigate } from "@/lib/navigate";

export default function Page() {
  const { currentUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!currentUser) router.push("/login");
  }, [currentUser, router]);

  if (!currentUser) return null;

  return (
    <Dashboard
      currentUser={currentUser}
      onNavigate={(page, params) => appNavigate(router, page, params)}
    />
  );
}
