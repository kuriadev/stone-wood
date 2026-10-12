"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/contexts/AppContext";
import { AdminLogin } from "@/components/sections/AdminLogin";
import { announceSignIn } from "@/contexts/StaffContext";

export default function LoginPage() {
  const router = useRouter();
  const { setAdminAuth } = useApp();

  return (
    <AdminLogin
      onLogin={() => {
        // Other open admin tabs now act as whoever just signed in: tell them.
        announceSignIn();
        setAdminAuth(true);
        router.push("/admin");
      }}
      onGoHome={() => router.push("/")}
    />
  );
}
