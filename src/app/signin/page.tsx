"use client";

import { useEffect } from "react";
import { signIn } from "next-auth/react";

export default function SignInPage() {
  useEffect(() => {
    signIn("google", { callbackUrl: "/" });
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#dbe9ee", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "#4f6d7a", fontSize: "1rem", fontWeight: 500 }}>Redirecting to Google…</p>
      </div>
    </div>
  );
}
