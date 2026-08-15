/** Canonical public origin for guest-facing links (WhatsApp, QR, etc.). */
export function getAppOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (vercel) {
    return vercel.startsWith("http") ? vercel.replace(/\/$/, "") : `https://${vercel.replace(/\/$/, "")}`;
  }

  return "";
}

export function getBillShareUrl(token: string): string {
  const origin = getAppOrigin();
  const path = `/bill/${encodeURIComponent(token)}`;
  return origin ? `${origin}${path}` : path;
}

/** Normalize phone for wa.me (default India +91 when 10 digits). */
export function toWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `91${digits.slice(1)}`;
  return digits;
}
