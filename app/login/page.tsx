"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/contexts/AppContext";
import { AdminLogin } from "@/components/sections/AdminLogin";

export default function LoginPage() {
  const router = useRouter();
  const { setAdminAuth } = useApp();

  return (
    <AdminLogin
      onLogin={() => {
        setAdminAuth(true);
        router.push("/admin");
      }}
      onGoHome={() => router.push("/")}
    />
  );
}
