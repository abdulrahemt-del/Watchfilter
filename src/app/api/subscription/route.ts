import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { getStripe } from "@/lib/stripe";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ isPro: false, cancelAt: null });
  }

  try {
    const stripe = getStripe();
    const customers = await stripe.customers.list({ email: session.user.email, limit: 1 });
    if (customers.data.length === 0) return NextResponse.json({ isPro: false, cancelAt: null });

    const subs = await stripe.subscriptions.list({
      customer: customers.data[0].id,
      limit: 5,
    });

    const activeSub = subs.data.find((s) => {
      if (s.status !== "active") return false;
      if (s.cancel_at_period_end) return false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((s as any).cancel_at) return false;
      return true;
    });

    return NextResponse.json({ isPro: !!activeSub, cancelAt: null });
  } catch {
    return NextResponse.json({ isPro: false, cancelAt: null });
  }
}
