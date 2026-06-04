import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { saveRefreshToken, recordBetaEvent } from "@/lib/db";

async function refreshAccessToken(token: Record<string, unknown>) {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken as string,
      }),
    });
    const refreshed = (await res.json()) as {
      access_token: string;
      expires_in: number;
      error?: string;
    };
    if (refreshed.error) throw new Error(refreshed.error);
    return {
      ...token,
      accessToken: refreshed.access_token,
      accessTokenExpires: Date.now() + refreshed.expires_in * 1000,
      error: undefined,
    };
  } catch {
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/youtube.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // First sign-in: persist tokens from the provider
      if (account) {
        if (account.refresh_token && token.email) {
          await saveRefreshToken(token.email as string, account.refresh_token).catch((err) => {
            console.error("[auth] failed to save refresh token:", err);
          });
        }
        if (token.email) {
          recordBetaEvent("signup", token.email as string).catch(() => {});
        }
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: account.expires_at
            ? account.expires_at * 1000
            : 0,
        };
      }
      // Token still valid
      if (Date.now() < (token.accessTokenExpires as number)) return token;
      // Token expired — refresh
      return refreshAccessToken(token as Record<string, unknown>);
    },
    async session({ session, token }) {
      return {
        ...session,
        accessToken: token.accessToken as string | undefined,
        error: token.error as string | undefined,
      };
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
