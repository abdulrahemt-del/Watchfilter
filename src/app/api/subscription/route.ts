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

    // Fetch all non-cancelled subscriptions for this customer
    const subs = await stripe.subscriptions.list({
      customer: customers.data[0].id,
      limit: 5,
    });

    // Find an active subscription that is NOT pending cancellation
    const activeSub = subs.data.find(
      (s) => s.status === "active" && !s.cancel_at_period_end
    );

    if (activeSub) return NextResponse.json({ isPro: true, cancelAt: null });

    return NextResponse.json({ isPro: false, cancelAt: null });
  } catch {
    return NextResponse.json({ isPro: false, cancelAt: null });
  }
}
