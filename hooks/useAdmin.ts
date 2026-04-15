"use client";

import { useState } from "react";
import { ADMIN_CREDS } from "@/lib/constants";

export function useAdmin() {
  const [adminAuth, setAdminAuth] = useState(false);

  const login = (username: string, password: string): boolean => {
    if (username === ADMIN_CREDS.username && password === ADMIN_CREDS.password) {
      setAdminAuth(true);
      return true;
    }
    return false;
  };

  const logout = () => setAdminAuth(false);

  return { adminAuth, login, logout };
}
