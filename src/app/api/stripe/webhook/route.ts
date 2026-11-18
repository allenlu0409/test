// Stripe webhook：訂閱成立、變更、取消時同步店家的方案。
import { run } from "@/lib/db";
import { getSubscription, planForPrice, verifyWebhook, type StripeSubscription } from "@/lib/stripe";

export const dynamic = "force-dynamic";

function applySubscription(sub: StripeSubscription, businessId?: number) {
  const active = sub.status === "active" || sub.status === "trialing" || sub.status === "past_due";
  const item = sub.items.data[0];
  const plan = (active && planForPrice(item?.price.id)) || "free";
  const renews = sub.current_period_end ?? item?.current_period_end ?? null;
  const bizId = businessId ?? Number(sub.metadata?.business_id);

  if (plan === "free") {
    run("UPDATE businesses SET plan = 'free', stripe_subscription_id = NULL, plan_renews_at = NULL WHERE stripe_subscription_id = ? OR id = ?", sub.id, bizId || -1);
  } else if (bizId) {
    run("UPDATE businesses SET plan = ?, stripe_customer_id = ?, stripe_subscription_id = ?, plan_renews_at = ? WHERE id = ?", plan, sub.customer, sub.id, renews, bizId);
  } else {
    run("UPDATE businesses SET plan = ?, plan_renews_at = ? WHERE stripe_subscription_id = ?", plan, renews, sub.id);
  }
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("webhook not configured", { status: 503 });

  const payload = await req.text();
  if (!verifyWebhook(payload, req.headers.get("stripe-signature"), secret)) {
    return new Response("invalid signature", { status: 400 });
  }

  const event = JSON.parse(payload) as { type: string; data: { object: Record<string, unknown> } };
  const obj = event.data.object;
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const subId = obj.subscription as string | null;
        const bizId = Number(obj.client_reference_id);
        if (subId && bizId) applySubscription(await getSubscription(subId), bizId);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        applySubscription(
          event.type.endsWith("deleted") ? { ...(obj as unknown as StripeSubscription), status: "canceled" } : (obj as unknown as StripeSubscription),
        );
        break;
    }
  } catch (e) {
    console.error("stripe webhook failed", event.type, e);
    return new Response("handler error", { status: 500 }); // 讓 Stripe 重送
  }
  return Response.json({ received: true });
}
