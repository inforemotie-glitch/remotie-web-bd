/* =====================================================================
   REMOTIE  |  api/meta.js
   Meta Conversions API relay, running as a Vercel Serverless Function.
   Reachable at POST /api/meta
   ---------------------------------------------------------------------
   The browser sends one small JSON body here for every event it also
   fires through the Pixel. Both copies carry the same `eventId`, which
   is how Meta collapses the pair into a single event instead of
   counting it twice.

   Nothing secret reaches the browser. The access token lives only in
   the Vercel environment, and any raw email or phone value is hashed
   with SHA-256 here, before it is forwarded to Meta.
   ===================================================================== */
import crypto from "node:crypto";

/* Bump this when you move the ad account to a newer Graph API version. */
const API_VERSION = process.env.META_API_VERSION || "v20.0";

/* The endpoint is public, so only these event names are relayed. Without
   an allow-list anyone could POST junk events into the ad account. */
const ALLOWED_EVENTS = new Set([
  "PageView",
  "ViewContent",
  "Lead",
  "Contact",
  "Schedule",
  "CompleteRegistration"
]);

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Normalise then SHA-256 an identifier, the way Meta requires. */
function hashField(value) {
  if (!value) return undefined;
  const normalised = String(value).trim().toLowerCase();
  if (!normalised) return undefined;
  return crypto.createHash("sha256").update(normalised).digest("hex");
}

/** Phone numbers are hashed digits-only, country code included. */
function hashPhone(value) {
  if (!value) return undefined;
  const digits = String(value).replace(/[^0-9]/g, "");
  if (!digits) return undefined;
  return crypto.createHash("sha256").update(digits).digest("hex");
}

/** First address in the x-forwarded-for chain is the real visitor. */
function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  if (raw) return String(raw).split(",")[0].trim();
  return req.headers["x-real-ip"] || req.socket?.remoteAddress || undefined;
}

/** Vercel parses JSON bodies for you, but not on every runtime path,
    so fall back to reading the raw stream. */
async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return {}; }
}

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const pixelId = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;

  if (!pixelId || !token) {
    console.error("[meta] META_PIXEL_ID or META_CAPI_TOKEN is missing");
    return res.status(500).json({ error: "Server not configured" });
  }

  const body = await readBody(req);
  const {
    eventName,
    eventId,
    eventSourceUrl,
    customData = {},
    userData = {},
    fbp,
    fbc
  } = body;

  if (!eventName || !eventId) {
    return res.status(400).json({ error: "eventName and eventId are required" });
  }
  if (!ALLOWED_EVENTS.has(eventName)) {
    return res.status(400).json({ error: "Unsupported eventName" });
  }

  /* JSON.stringify drops every `undefined`, so unknown fields simply
     disappear from the payload instead of being sent as empty values. */
  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,                 /* identical to the Pixel's → dedup */
        event_source_url: eventSourceUrl || req.headers.referer || undefined,
        action_source: "website",
        user_data: {
          client_ip_address: clientIp(req),
          client_user_agent: req.headers["user-agent"],
          fbp: fbp || undefined,           /* Pixel browser id cookie   */
          fbc: fbc || undefined,           /* click id from ?fbclid=    */
          em: hashField(userData.email),
          ph: hashPhone(userData.phone)
        },
        custom_data: customData
      }
    ]
  };

  /* Set META_TEST_EVENT_CODE while you verify in Events Manager →
     Test Events, then delete it so live traffic is not flagged. */
  if (process.env.META_TEST_EVENT_CODE) {
    payload.test_event_code = process.env.META_TEST_EVENT_CODE;
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${pixelId}/events`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      }
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("[meta] Graph API rejected the event", response.status, result);
      return res.status(502).json({
        error: "Meta rejected the event",
        detail: result?.error?.message
      });
    }

    return res.status(200).json({
      ok: true,
      eventId,
      events_received: result.events_received
    });
  } catch (err) {
    console.error("[meta] request to Graph API failed", err);
    return res.status(502).json({ error: "Upstream request failed" });
  }
}
