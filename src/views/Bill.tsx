"use client";

import { useEffect, useState } from "react";
import type { BillSnapshot } from "../data/types";
import { formatCurrency, formatDate } from "../data/types";
import { useDocument } from "../lib/firebase/hooks";
import type { Page } from "../components/Layout";
import QRCode from "qrcode";

interface Props {
  /** Unguessable public share token (preferred) or legacy booking id */
  token: string;
  onNavigate?: (page: Page, params?: Record<string, string>) => void;
}

export default function Bill({ token, onNavigate }: Props) {
  const { data: publicBill, loading: publicLoading } = useDocument<BillSnapshot & { token?: string; bookingId?: string }>(
    "publicBills",
    token
  );
  const { data: staffBill, loading: staffLoading } = useDocument<BillSnapshot>("bills", token);
  const bill = publicBill ?? staffBill;
  const loading = publicLoading || (staffLoading && !publicBill);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  const bookingId = (publicBill?.bookingId || staffBill?.bookingId || token) as string;
  const billUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/bill/${publicBill?.token || token}`
      : `/bill/${token}`;

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(billUrl, { width: 160, margin: 1 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [billUrl]);

  if (loading) {
    return (
      <div className="p-8 text-center" style={{ color: "var(--muted-foreground)" }}>
        Loading bill…
      </div>
    );
  }
  if (!bill) {
    return (
      <div className="p-8 text-center" style={{ color: "var(--muted-foreground)" }}>
        Bill not found. Use the secure link from checkout, or complete checkout to generate a guest bill.
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start py-10 px-4"
      style={{ background: "var(--background)" }}
    >
      {onNavigate && (
        <button
          className="self-start ml-4 mb-6 text-sm"
          style={{ color: "var(--muted-foreground)" }}
          onClick={() => onNavigate("booking-detail", { bookingId })}
        >
          ← Back to Booking
        </button>
      )}

      <div className="w-full max-w-md">
        <div
          className="rounded-t-xl px-8 py-6 text-center"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
        >
          <div
            className="text-sm mb-1 opacity-70"
            style={{ fontFamily: "DM Mono, monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}
          >
            Havens Hospitality
          </div>
          <h1 className="text-3xl mb-1" style={{ fontFamily: "DM Serif Display, serif" }}>
            Tax Invoice
          </h1>
          <div className="text-sm opacity-70">{bill.houseName}</div>
          <div className="text-xs opacity-60 mt-1">{bill.houseAddress}</div>
        </div>

        <div
          className="rounded-b-xl px-8 py-6 space-y-5"
          style={{ background: "var(--card)", border: "1px solid var(--border)", borderTop: "none" }}
        >
          <div className="flex justify-between text-sm">
            <div>
              <div className="text-xs uppercase tracking-wide mb-0.5" style={{ color: "var(--muted-foreground)" }}>Guest</div>
              <div className="font-medium" style={{ color: "var(--foreground)" }}>{bill.customerName}</div>
              <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{bill.customerPhone}</div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide mb-0.5" style={{ color: "var(--muted-foreground)" }}>Stay</div>
              <div className="text-sm" style={{ color: "var(--foreground)" }}>
                {formatDate(bill.checkIn)} → {formatDate(bill.checkOut)}
              </div>
              <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                Room {bill.roomNumber} · {bill.roomType} · {bill.nights} night{bill.nights !== 1 ? "s" : ""}
              </div>
            </div>
          </div>

          <div className="space-y-2 text-sm" style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <div className="flex justify-between">
              <span style={{ color: "var(--muted-foreground)" }}>Room ({bill.nights} × {formatCurrency(bill.rent)})</span>
              <span style={{ fontFamily: "DM Mono, monospace" }}>{formatCurrency(bill.roomTotal)}</span>
            </div>
            {(bill.discount ?? 0) > 0 && (
              <div className="flex justify-between" style={{ color: "var(--status-vacant)" }}>
                <span>Discount</span>
                <span style={{ fontFamily: "DM Mono, monospace" }}>−{formatCurrency(bill.discount ?? 0)}</span>
              </div>
            )}
            {(bill.extraBedTotal ?? 0) > 0 && (
              <div className="flex justify-between">
                <span style={{ color: "var(--muted-foreground)" }}>
                  Extra beds ({bill.extraBedsUsed} × {formatCurrency(bill.extraBedRate ?? 0)} × {bill.nights})
                </span>
                <span style={{ fontFamily: "DM Mono, monospace" }}>{formatCurrency(bill.extraBedTotal ?? 0)}</span>
              </div>
            )}
            {bill.purchaseLines.map((line, i) => (
              <div key={i} className="flex justify-between">
                <span style={{ color: "var(--muted-foreground)" }}>
                  {line.label} × {line.quantity}
                </span>
                <span style={{ fontFamily: "DM Mono, monospace" }}>{formatCurrency(line.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between pt-2" style={{ borderTop: "1px solid var(--border)" }}>
              <span style={{ color: "var(--muted-foreground)" }}>Subtotal</span>
              <span style={{ fontFamily: "DM Mono, monospace" }}>{formatCurrency(bill.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: "var(--muted-foreground)" }}>GST (12%)</span>
              <span style={{ fontFamily: "DM Mono, monospace" }}>{formatCurrency(bill.taxAmount)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold pt-1">
              <span>Total</span>
              <span style={{ fontFamily: "DM Mono, monospace" }}>{formatCurrency(bill.totalWithTax)}</span>
            </div>
            {(bill.amountPaid ?? 0) > 0 && (
              <>
                <div className="flex justify-between" style={{ color: "var(--status-vacant)" }}>
                  <span>Paid already</span>
                  <span style={{ fontFamily: "DM Mono, monospace" }}>−{formatCurrency(bill.amountPaid ?? 0)}</span>
                </div>
                {(bill.payments ?? []).length > 0 && (
                  <div className="pl-2 space-y-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {(bill.payments ?? []).map((p) => (
                      <div key={p.paymentId} className="flex justify-between gap-2">
                        <span>
                          {formatDate(p.paidAt.slice(0, 10))}
                          {p.note ? ` · ${p.note}` : ""}
                        </span>
                        <span style={{ fontFamily: "DM Mono, monospace" }}>{formatCurrency(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-between text-base font-semibold">
                  <span>Balance due</span>
                  <span style={{ fontFamily: "DM Mono, monospace" }}>
                    {formatCurrency(bill.balanceDue ?? Math.max(0, bill.totalWithTax - (bill.amountPaid ?? 0)))}
                  </span>
                </div>
              </>
            )}
            {(bill.paid || (bill.balanceDue ?? 1) <= 0) && (
              <div className="text-center text-xs font-semibold py-1 rounded" style={{ background: "var(--status-vacant-bg)", color: "var(--status-vacant)" }}>
                PAID
              </div>
            )}
          </div>

          {qrDataUrl && (
            <div className="flex flex-col items-center pt-2">
              <img src={qrDataUrl} alt="Bill QR" className="w-28 h-28 rounded" />
              <p className="text-[10px] mt-2 text-center" style={{ color: "var(--muted-foreground)" }}>
                Scan to reopen this secure bill link
              </p>
            </div>
          )}

          <p className="text-[10px] text-center" style={{ color: "var(--muted-foreground)" }}>
            Invoice generated {formatDate(bill.createdAt.slice(0, 10))} · Ref {bookingId.slice(0, 12)}
          </p>
        </div>
      </div>
    </div>
  );
}
