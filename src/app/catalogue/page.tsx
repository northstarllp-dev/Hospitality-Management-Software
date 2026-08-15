"use client";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import Catalogue from "@/views/Catalogue";
import { useEffect } from "react";

export default function Page() {
  const { currentUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!currentUser) router.push("/login");
  }, [currentUser, router]);

  if (!currentUser) return null;

  return <Catalogue currentUser={currentUser} />;
}
