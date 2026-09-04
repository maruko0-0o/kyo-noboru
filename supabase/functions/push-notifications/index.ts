import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

const env = (name: string) => Deno.env.get(name) ?? "";
const keyFromMap = (name: string, legacy: string) => {
  if (env(legacy)) return env(legacy);
  try {
    const keys = JSON.parse(env(name));
    return keys.default ?? Object.values(keys)[0] ?? "";
  } catch {
    return "";
  }
};

const supabaseUrl = env("SUPABASE_URL");
const publishableKey = keyFromMap("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
const secretKey = keyFromMap("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient(supabaseUrl, secretKey);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function configureWebPush() {
  const publicKey = env("PUSH_VAPID_PUBLIC_KEY");
  const privateKey = env("PUSH_VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) throw new Error("PUSH_VAPID_PUBLIC_KEY and PUSH_VAPID_PRIVATE_KEY are required");
  webpush.setVapidDetails(env("PUSH_VAPID_SUBJECT") || "mailto:calendar@example.com", publicKey, privateKey);
  return publicKey;
}

async function currentUser(req: Request) {
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization) return null;
  const client = createClient(supabaseUrl, publishableKey, { global: { headers: { Authorization: authorization } } });
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user;
}

function eventCopy(type: string, gymName: string, actorName: string) {
  if (type === "INSERT") return `${actorName} 新增了 ${gymName} 的行程`;
  if (type === "UPDATE") return `${actorName} 修改了 ${gymName} 的行程`;
  return `${actorName} 取消了一条行程`;
}

async function dispatchPush(event: Record<string, unknown>) {
  const row = (event.event_type === "DELETE" ? event.old_record : event.record) as Record<string, string> | null;
  if (!row?.group_id) return;

  const [{ data: subscriptions }, { data: gym }, { data: actor }] = await Promise.all([
    admin.from("climb_push_subscriptions").select("endpoint,p256dh,auth,member_id").eq("group_id", row.group_id),
    row.gym_id ? admin.from("climb_gyms").select("name").eq("id", row.gym_id).maybeSingle() : Promise.resolve({ data: null }),
    row.creator_member_id ? admin.from("climb_members").select("display_name").eq("id", row.creator_member_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const gymName = gym?.name ?? "攀岩馆";
  const actorName = actor?.display_name ?? "一位岩友";
  const payload = JSON.stringify({
    title: "今日、登る？",
    body: eventCopy(String(event.event_type), gymName, actorName),
    url: "./",
    tag: `climb-session-${row.id}`,
  });

  await Promise.all((subscriptions ?? [])
    .filter((subscription) => subscription.member_id !== row.creator_member_id)
    .map(async (subscription) => {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, payload, { TTL: 60 });
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("climb_push_subscriptions").delete()
            .eq("group_id", row.group_id).eq("endpoint", subscription.endpoint);
        } else console.error("push delivery failed", error);
      }
    }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  if (body.action === "dispatch") {
    if (req.headers.get("x-climb-push-secret") !== env("PUSH_WEBHOOK_SECRET")) return json({ error: "Forbidden" }, 403);
    try { configureWebPush(); await dispatchPush(body); return json({ ok: true }); }
    catch (error) { console.error(error); return json({ error: "Push dispatch failed" }, 500); }
  }

  const user = await currentUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  if (body.action === "config") {
    try { return json({ publicKey: configureWebPush() }); }
    catch { return json({ error: "Push service is not configured" }, 503); }
  }

  const groupId = String(body.group_id ?? "");
  if (!groupId) return json({ error: "Missing group_id" }, 400);
  if (body.action === "subscribe") {
    const memberId = String(body.member_id ?? "");
    const subscription = body.subscription as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | undefined;
    if (!memberId || !subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) return json({ error: "Invalid subscription" }, 400);
    const { data: member } = await admin.from("climb_members").select("id").eq("id", memberId).eq("group_id", groupId).eq("active", true).maybeSingle();
    if (!member) return json({ error: "Unknown group member" }, 403);
    const { error } = await admin.from("climb_push_subscriptions").upsert({
      group_id: groupId, member_id: memberId, auth_user_id: user.id,
      endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth,
      updated_at: new Date().toISOString(),
    }, { onConflict: "group_id,endpoint" });
    return error ? json({ error: error.message }, 500) : json({ ok: true });
  }

  if (body.action === "unsubscribe") {
    const endpoint = String(body.endpoint ?? "");
    const { error } = await admin.from("climb_push_subscriptions").delete()
      .eq("group_id", groupId).eq("endpoint", endpoint).eq("auth_user_id", user.id);
    return error ? json({ error: error.message }, 500) : json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
});
