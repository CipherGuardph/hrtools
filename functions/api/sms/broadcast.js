function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function normalizeRecipient(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.startsWith("63") && digits.length === 12) return digits;
  if (digits.startsWith("09") && digits.length === 11) return `63${digits.slice(1)}`;
  if (digits.startsWith("9") && digits.length === 10) return `63${digits}`;
  return null;
}

function hasUnicode(text) {
  return /[^\u0000-\u007f]/.test(String(text || ""));
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const message = String(body?.message || "").trim();
    const rawRecipients = Array.isArray(body?.recipients) ? body.recipients : [];
    const recipients = rawRecipients
      .map(normalizeRecipient)
      .filter(Boolean)
      .filter((value, index, list) => list.indexOf(value) === index)
      .slice(0, 20);

    if (!message) {
      return json({ status: "error", message: "Message is required." }, 400);
    }

    if (!recipients.length) {
      return json({ status: "error", message: "At least one valid recipient is required." }, 400);
    }

    const apiToken = context.env.PHILSMS_API_TOKEN;
    const senderId = context.env.PHILSMS_SENDER_ID;
    const baseUrl = String(context.env.PHILSMS_BASE_URL || "https://app.philsms.com/api/v3").replace(/\/$/, "");

    if (!apiToken) {
      return json({ status: "error", message: "Missing Cloudflare variable: PHILSMS_API_TOKEN." }, 500);
    }

    if (!senderId) {
      return json({ status: "error", message: "Missing Cloudflare variable: PHILSMS_SENDER_ID." }, 500);
    }

    const upstream = await fetch(`${baseUrl}/sms/send`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: recipients.join(","),
        sender_id: senderId,
        type: hasUnicode(message) ? "unicode" : "plain",
        message,
      }),
    });

    const text = await upstream.text();
    let payload;

    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }

    if (!upstream.ok) {
      return json({
        status: "error",
        message: payload?.message || `PhilSMS request failed with status ${upstream.status}.`,
        details: payload,
      }, upstream.status);
    }

    return json({
      status: "success",
      message: payload?.message || "Broadcast submitted to PhilSMS successfully.",
      recipients,
      provider: payload,
    });
  } catch (error) {
    return json({
      status: "error",
      message: error instanceof Error ? error.message : "Unexpected server error.",
    }, 500);
  }
}
