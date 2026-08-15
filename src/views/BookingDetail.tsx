import { useMemo, useState } from 'react';
import type { User, House, Booking, BookingPayment, Customer, CatalogueItem, BillSnapshot, Purchase } from '../data/types';
import {
  formatCurrency,
  calcNights,
  formatDate,
  calcExtraBedTotal,
  calcBookingTotal,
  calcAmountPaid,
  calcTaxAmount,
  calcLineTaxes,
  calcBalanceDue,
} from '../data/types';
import { useCollection, useHouseRooms, usePurchasesByBooking } from '../lib/firebase/hooks';
import { db } from '../lib/firebase/config';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import type { Page } from '../components/Layout';
import { cancelBookingAtomic, checkInBookingAtomic, checkoutBookingAtomic, updateBookingDatesAtomic } from '@/lib/bookingService';
import { createId } from '@/lib/ids';
import { useToast } from '@/components/ToastProvider';
import { getBillShareUrl, toWhatsAppPhone } from '@/lib/share';
import { canAccessHouse } from '@/lib/permissions';

interface Props {
  currentUser: User;
  bookingId: string;
  openAddPurchase?: boolean;
  onNavigate: (page: Page, params?: Record<string, string>) => void;
}

export default function BookingDetail({ currentUser, bookingId, openAddPurchase, onNavigate }: Props) {
  const toast = useToast();
  const { data: BOOKINGS, loading: bookingsLoading } = useCollection<Booking>('bookings');
  const { data: HOUSES, loading: housesLoading } = useCollection<House>('houses');
  const { data: CUSTOMERS } = useCollection<Customer>('customers');
  const { data: CATALOGUE } = useCollection<CatalogueItem>('catalogue');
  const booking = BOOKINGS.find(b => b.bookingId === bookingId);
  const houseCatalogue = useMemo(
    () => CATALOGUE.filter(i => i.houseId === booking?.houseId),
    [CATALOGUE, booking?.houseId]
  );
  const { data: rooms } = useHouseRooms(booking?.houseId ?? null);
  const { data: purchases, loading: purchasesLoading } = usePurchasesByBooking(bookingId);

  const [addItem, setAddItem] = useState('');
  const [addQty, setAddQty] = useState(1);
  const [showAddForm, setShowAddForm] = useState(!!openAddPurchase);
  const [saving, setSaving] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [vacatePanel, setVacatePanel] = useState(false);
  const [reschedulePanel, setReschedulePanel] = useState(false);
  const [editCheckIn, setEditCheckIn] = useState('');
  const [editCheckOut, setEditCheckOut] = useState('');
  const [editRent, setEditRent] = useState(0);
  const [editDiscount, setEditDiscount] = useState(0);
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');
  const [showPayForm, setShowPayForm] = useState(false);
  const loading = bookingsLoading || housesLoading || purchasesLoading;

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--muted-foreground)' }}>Loading booking…</div>;
  if (!booking) return <div className="p-8" style={{ color: 'var(--muted-foreground)' }}>Booking not found.</div>;
  if (!canAccessHouse(currentUser, booking.houseId)) {
    return <div className="p-8" style={{ color: 'var(--muted-foreground)' }}>You do not have access to this booking.</div>;
  }

  const house = HOUSES.find(h => h.houseId === booking.houseId);
  const room = rooms.find(r => r.roomId === booking.roomId);
  const customer = CUSTOMERS.find(c => c.customerId === booking.customerId);
  const getCatalogueItem = (id: string) => CATALOGUE.find(i => i.itemId === id);
  const nights = calcNights(booking.checkIn, booking.checkOut);
  const roomTotal = booking.rent * nights;
  const discount = Math.max(0, booking.discount ?? 0);
  const extraBedsUsed = booking.extraBedsUsed ?? 0;
  const extraBedRate = booking.extraBedRate ?? 0;
  const extraBedTotal = calcExtraBedTotal(extraBedsUsed, extraBedRate, nights);
  const purchaseTotal = purchases.reduce((s, p) => s + p.price * p.quantity, 0);
  const grandTotal = calcBookingTotal(booking, purchases);
  const roomCharge = Math.max(0, roomTotal - discount);
  const purchaseAmounts = purchases.map((p) => p.price * p.quantity);
  const { roomTax, extraBedTax, purchaseTaxes, taxAmount: taxEstimate } = calcLineTaxes({
    roomCharge,
    extraBedTotal,
    purchaseAmounts,
  });
  const totalWithTaxEstimate = grandTotal + taxEstimate;
  const payments = booking.payments ?? [];
  const amountPaid = calcAmountPaid(payments);
  const balanceDue = calcBalanceDue(totalWithTaxEstimate, amountPaid);
  const checkedOut = booking.status === 'checked-out';
  const cancelled = booking.status === 'cancelled';
  const canEditCharges = !checkedOut && !cancelled && (booking.status === 'checked-in' || booking.status === 'confirmed');
  const canRecordPayment = !cancelled;
  const canCancel = booking.status === 'confirmed' || booking.status === 'checked-in';

  const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
    'confirmed': { bg: '#EDF4FF', text: '#1A56B0' },
    'checked-in': { bg: 'var(--status-vacant-bg)', text: 'var(--status-vacant)' },
    'checked-out': { bg: 'var(--secondary)', text: 'var(--muted-foreground)' },
    'cancelled': { bg: 'var(--status-occupied-bg)', text: 'var(--status-occupied)' },
  };
  const sc = STATUS_STYLE[booking.status] || STATUS_STYLE['confirmed'];

  const shareToken = booking.shareToken;
  const billUrl = shareToken ? getBillShareUrl(shareToken) : "";

  const waPhone = toWhatsAppPhone(customer?.phone ?? "");
  const whatsappChatUrl = waPhone ? `https://wa.me/${waPhone}` : null;
  const whatsappBillUrl =
    waPhone && shareToken && billUrl
      ? `https://wa.me/${waPhone}?text=${encodeURIComponent(
          [
            `Hi ${customer?.name ?? "guest"},`,
            "",
            `Your stay bill at ${house?.name ?? "Havens"} (Room ${room?.roomNumber ?? ""}) is ready.`,
            `Total: ${formatCurrency(totalWithTaxEstimate)}`,
            amountPaid > 0 ? `Paid: ${formatCurrency(amountPaid)}` : null,
            amountPaid > 0 ? `Balance: ${formatCurrency(balanceDue)}` : null,
            "",
            "View your bill here:",
            billUrl,
          ]
            .filter(Boolean)
            .join("\n")
        )}`
      : null;

  const syncBillPayments = async (
    nextPayments: BookingPayment[],
    opts?: { markFullyPaid?: boolean }
  ) => {
    const paidSum = calcAmountPaid(nextPayments);
    const bal = calcBalanceDue(totalWithTaxEstimate, paidSum);
    const fullyPaid = opts?.markFullyPaid || bal <= 0;
    const paidAt = fullyPaid ? new Date().toISOString() : null;
    const billPatch = {
      payments: nextPayments,
      amountPaid: paidSum,
      balanceDue: bal,
      paid: fullyPaid,
      paidAt,
    };
    await updateDoc(doc(db, 'bookings', bookingId), {
      payments: nextPayments,
      paid: fullyPaid,
      paidAt,
    });
    if (checkedOut) {
      await updateDoc(doc(db, 'bills', bookingId), billPatch).catch(() => {});
      if (booking.shareToken) {
        await updateDoc(doc(db, 'publicBills', booking.shareToken), billPatch).catch(() => {});
      }
    }
  };

  const handleAddPurchase = async () => {
    if (!addItem) return;
    const item = getCatalogueItem(addItem);
    if (!item) return;
    setSaving(true);
    const purchaseId = createId('p');
    try {
      await setDoc(doc(db, 'purchases', purchaseId), {
        purchaseId,
        bookingId,
        houseId: booking.houseId,
        roomId: booking.roomId,
        itemId: addItem,
        quantity: addQty,
        price: item.price,
        addedBy: currentUser.uid,
        timestamp: new Date().toISOString(),
      });
      setAddItem('');
      setAddQty(1);
      setShowAddForm(false);
      toast.success('Purchase added.');
    } catch (e) {
      console.error(e);
      toast.error('Could not add purchase.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePurchase = async (p: Purchase) => {
    if (!window.confirm('Remove this purchase from the bill?')) return;
    try {
      await deleteDoc(doc(db, 'purchases', p.purchaseId));
      toast.success('Purchase removed.');
    } catch (e) {
      console.error(e);
      toast.error('Could not remove purchase.');
    }
  };

  const handleCheckIn = async () => {
    setSaving(true);
    try {
      await checkInBookingAtomic(db, booking);
      toast.success('Guest checked in.');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Check-in failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Cancel this booking? The room will become available for these dates.')) return;
    setSaving(true);
    try {
      await cancelBookingAtomic(db, booking, room?.currentStatus ?? 'vacant');
      toast.success('Booking cancelled.');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Could not cancel booking.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddPayment = async () => {
    const amount = Math.round(Number(payAmount));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid payment amount.');
      return;
    }
    setSaving(true);
    try {
      const entry: BookingPayment = {
        paymentId: createId('pay'),
        amount,
        paidAt: new Date().toISOString(),
        note: payNote.trim() || undefined,
        recordedBy: currentUser.uid,
      };
      const next = [...payments, entry];
      await syncBillPayments(next);
      setPayAmount('');
      setPayNote('');
      setShowPayForm(false);
      toast.success('Payment recorded.');
    } catch (e) {
      console.error(e);
      toast.error('Could not record payment.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemovePayment = async (paymentId: string) => {
    if (!window.confirm('Remove this payment?')) return;
    setSaving(true);
    try {
      const next = payments.filter((p) => p.paymentId !== paymentId);
      await syncBillPayments(next);
      toast.success('Payment removed.');
    } catch (e) {
      console.error(e);
      toast.error('Could not remove payment.');
    } finally {
      setSaving(false);
    }
  };

  const handleCheckout = async () => {
    setCheckingOut(true);
    try {
      const purchaseLines = purchases.map((p, i) => ({
        label: getCatalogueItem(p.itemId)?.name ?? p.itemId,
        quantity: p.quantity,
        unitPrice: p.price,
        amount: p.price * p.quantity,
        taxAmount: purchaseTaxes[i] ?? calcTaxAmount(p.price * p.quantity),
      }));
      const taxAmount = taxEstimate;
      const totalWithTax = grandTotal + taxAmount;
      const paidSum = calcAmountPaid(payments);
      const bal = calcBalanceDue(totalWithTax, paidSum);
      const fullyPaid = bal <= 0;
      const bill: BillSnapshot = {
        bookingId,
        houseId: booking.houseId,
        houseName: house?.name ?? '',
        houseAddress: house?.address ?? '',
        roomNumber: room?.roomNumber ?? '',
        roomType: room?.type ?? '',
        customerName: customer?.name ?? '',
        customerPhone: customer?.phone ?? '',
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        nights,
        rent: booking.rent,
        roomTotal,
        roomTax,
        discount,
        guestCount: booking.guestCount,
        extraBedsUsed,
        extraBedRate,
        extraBedTotal,
        extraBedTax,
        purchaseLines,
        purchaseTotal,
        subtotal: grandTotal,
        taxAmount,
        totalWithTax,
        amountPaid: paidSum,
        balanceDue: bal,
        payments,
        createdAt: new Date().toISOString(),
        paid: fullyPaid,
        paidAt: fullyPaid ? new Date().toISOString() : undefined,
      };

      const { shareToken } = await checkoutBookingAtomic(
        db,
        booking,
        bill,
        room?.currentStatus ?? 'vacant'
      );
      setVacatePanel(false);
      toast.success(fullyPaid ? 'Checked out. Bill fully paid.' : 'Checked out. Guest bill is ready.');
      onNavigate('public-bill', { token: shareToken, bookingId });
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Checkout failed.');
      setCheckingOut(false);
    }
  };

  const handleMarkPaid = async () => {
    if (booking.paid) return;
    setSaving(true);
    try {
      const paidAt = new Date().toISOString();
      const billPatch = {
        paid: true,
        paidAt,
        amountPaid: Math.max(amountPaid, totalWithTaxEstimate),
        balanceDue: 0,
      };
      await updateDoc(doc(db, 'bookings', bookingId), { paid: true, paidAt });
      await updateDoc(doc(db, 'bills', bookingId), billPatch).catch(() => {});
      if (booking.shareToken) {
        await updateDoc(doc(db, 'publicBills', booking.shareToken), billPatch).catch(() => {});
      }
      toast.success('Marked as paid.');
    } catch (e) {
      console.error(e);
      toast.error('Could not update payment status.');
    } finally {
      setSaving(false);
    }
  };

  const openReschedule = () => {
    setEditCheckIn(booking.checkIn);
    setEditCheckOut(booking.checkOut);
    setEditRent(booking.rent);
    setEditDiscount(booking.discount ?? 0);
    setReschedulePanel(true);
    setVacatePanel(false);
  };

  const handleReschedule = async () => {
    setSaving(true);
    try {
      await updateBookingDatesAtomic(db, booking, {
        checkIn: editCheckIn,
        checkOut: editCheckOut,
        rent: editRent,
        discount: editDiscount,
        roomCurrentStatus: room?.currentStatus ?? 'vacant'
      });
      toast.success('Booking updated.');
      setReschedulePanel(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Could not update booking.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <button className="text-sm mb-5 flex items-center gap-1" style={{ color: 'var(--muted-foreground)' }} onClick={() => onNavigate('bookings')}>
        ← Bookings
      </button>

      <div className="flex items-start justify-between mb-6 gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h1 className="text-3xl" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--foreground)' }}>{customer?.name}</h1>
            <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: sc.bg, color: sc.text }}>{booking.status.replace('-', ' ')}</span>
            {booking.paid && (
              <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: 'var(--status-vacant-bg)', color: 'var(--status-vacant)' }}>Paid</span>
            )}
            {checkedOut && !booking.paid && (
              <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: 'var(--status-maintenance-bg)', color: 'var(--status-maintenance)' }}>Unpaid</span>
            )}
          </div>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            {house?.name} · Room {room?.roomNumber} ({room?.type})
            {booking.guestCount ? ` · ${booking.guestCount} guest${booking.guestCount === 1 ? '' : 's'}` : ''}
          </p>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace' }}>
            {formatDate(booking.checkIn)} → {formatDate(booking.checkOut)} · {nights} nights
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end items-start">
          {booking.status === 'confirmed' && (
            <button
              onClick={handleCheckIn}
              disabled={saving}
              className="px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-60"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              {saving ? 'Checking in…' : 'Check In'}
            </button>
          )}
          {booking.status === 'checked-in' && (
            <button
              type="button"
              disabled
              className="px-4 py-2 rounded-md text-sm font-semibold cursor-default"
              style={{ background: 'var(--status-vacant-bg)', color: 'var(--status-vacant)' }}
            >
              Checked In
            </button>
          )}
          {canEditCharges && (
            <>
              <button
                onClick={openReschedule}
                className="px-4 py-2 rounded-md text-sm font-semibold"
                style={{ background: 'var(--secondary)', color: 'var(--secondary-foreground)' }}
              >
                Reschedule / Extend
              </button>
              <button
                onClick={() => { setVacatePanel(true); setReschedulePanel(false); setShowAddForm(true); }}
                className="px-4 py-2 rounded-md text-sm font-semibold"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                Vacate & Bill
              </button>
            </>
          )}
          {canCancel && (
            <button
              onClick={handleCancel}
              disabled={saving}
              className="px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-60"
              style={{ background: 'var(--status-occupied-bg)', color: 'var(--status-occupied)' }}
            >
              Cancel Booking
            </button>
          )}
          {checkedOut && (
            <>
              <button
                onClick={() => onNavigate('public-bill', { token: booking.shareToken || bookingId, bookingId })}
                className="px-4 py-2 rounded-md text-sm font-semibold"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                View Bill
              </button>
              {!booking.paid && (
                <button
                  onClick={handleMarkPaid}
                  disabled={saving}
                  className="px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-60"
                  style={{ background: 'var(--status-vacant)', color: 'white' }}
                >
                  {saving ? 'Saving…' : 'Mark as Paid'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {vacatePanel && canEditCharges && (
        <div className="rounded-lg p-5 mb-5" style={{ background: 'var(--card)', border: '2px solid var(--accent)' }}>
          <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--foreground)' }}>Finalize bill before vacating</h2>
          <p className="text-xs mb-4" style={{ color: 'var(--muted-foreground)' }}>
            Add any catalogue items the guests bought during the stay, then confirm checkout to generate the bill.
          </p>

          <div className="flex flex-wrap gap-3 items-end mb-4">
            <div className="flex-1 min-w-48">
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Catalogue item</label>
              <select
                value={addItem}
                onChange={e => setAddItem(e.target.value)}
                className="w-full px-3 py-2 rounded text-sm outline-none"
                style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              >
                <option value="">Select item…</option>
                {houseCatalogue.map(i => <option key={i.itemId} value={i.itemId}>{i.name} — {formatCurrency(i.price)}</option>)}
              </select>
            </div>
            <div className="w-24">
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Qty</label>
              <input
                type="number"
                min={1}
                value={addQty}
                onChange={e => setAddQty(Number(e.target.value))}
                className="w-full px-3 py-2 rounded text-sm outline-none"
                style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              />
            </div>
            <button
              onClick={handleAddPurchase}
              disabled={saving || !addItem}
              className="px-4 py-2 rounded text-sm font-semibold disabled:opacity-50"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              Add to bill
            </button>
          </div>

          {houseCatalogue.length === 0 && (
            <p className="text-xs mb-3" style={{ color: 'var(--status-occupied)' }}>
              No catalogue items for this property. Add items under Catalogue first.
            </p>
          )}

          <div className="text-sm mb-4" style={{ color: 'var(--muted-foreground)' }}>
            Current total (before tax): <span style={{ color: 'var(--foreground)', fontFamily: 'DM Mono, monospace' }}>{formatCurrency(grandTotal)}</span>
            {purchases.length > 0 ? ` · ${purchases.length} purchase line${purchases.length === 1 ? '' : 's'}` : ' · no catalogue purchases yet'}
            <br />
            Est. with GST: <span style={{ color: 'var(--foreground)', fontFamily: 'DM Mono, monospace' }}>{formatCurrency(totalWithTaxEstimate)}</span>
            {amountPaid > 0 && (
              <>
                {' · '}Paid: <span style={{ color: 'var(--status-vacant)', fontFamily: 'DM Mono, monospace' }}>{formatCurrency(amountPaid)}</span>
                {' · '}Balance: <span style={{ fontFamily: 'DM Mono, monospace' }}>{formatCurrency(balanceDue)}</span>
              </>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleCheckout}
              disabled={checkingOut}
              className="px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-60"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              {checkingOut ? 'Generating bill…' : 'Confirm vacate & generate bill'}
            </button>
            <button
              onClick={() => setVacatePanel(false)}
              className="px-4 py-2 rounded-md text-sm font-medium"
              style={{ background: 'var(--secondary)', color: 'var(--secondary-foreground)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {reschedulePanel && canEditCharges && (
        <div className="rounded-lg p-5 mb-5" style={{ background: 'var(--card)', border: '2px solid var(--accent)' }}>
          <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--foreground)' }}>Reschedule or Extend Booking</h2>
          <p className="text-xs mb-4" style={{ color: 'var(--muted-foreground)' }}>
            Update the dates for this stay. The system will verify if the room is available for the new dates.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Check-in</label>
              <input
                type="date"
                value={editCheckIn}
                onChange={e => setEditCheckIn(e.target.value)}
                className="w-full px-3 py-2 rounded text-sm outline-none"
                style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Check-out</label>
              <input
                type="date"
                value={editCheckOut}
                onChange={e => setEditCheckOut(e.target.value)}
                className="w-full px-3 py-2 rounded text-sm outline-none"
                style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              />
              <div className="flex gap-1 mt-1">
                <button
                  onClick={() => {
                    if (!editCheckOut) return;
                    const d = new Date(editCheckOut);
                    d.setDate(d.getDate() + 1);
                    setEditCheckOut(d.toISOString().split('T')[0]);
                  }}
                  className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--secondary)', color: 'var(--secondary-foreground)' }}
                >+1 day</button>
                <button
                  onClick={() => {
                    if (!editCheckOut) return;
                    const d = new Date(editCheckOut);
                    d.setDate(d.getDate() + 2);
                    setEditCheckOut(d.toISOString().split('T')[0]);
                  }}
                  className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--secondary)', color: 'var(--secondary-foreground)' }}
                >+2 days</button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Rent / Night</label>
              <input
                type="number"
                min={0}
                value={editRent}
                onChange={e => setEditRent(Number(e.target.value))}
                className="w-full px-3 py-2 rounded text-sm outline-none"
                style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Discount (Flat)</label>
              <input
                type="number"
                min={0}
                value={editDiscount}
                onChange={e => setEditDiscount(Number(e.target.value))}
                className="w-full px-3 py-2 rounded text-sm outline-none"
                style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              />
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleReschedule}
              disabled={saving || !editCheckIn || !editCheckOut || editCheckOut <= editCheckIn}
              className="px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-60"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button
              onClick={() => setReschedulePanel(false)}
              disabled={saving}
              className="px-4 py-2 rounded-md text-sm font-medium"
              style={{ background: 'var(--secondary)', color: 'var(--secondary-foreground)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg p-5 mb-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--foreground)' }}>Guest Details</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' }}>Phone</div>
            <div style={{ color: 'var(--foreground)' }}>{customer?.phone}</div>
          </div>
          <div>
            <div className="text-xs" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' }}>Email</div>
            <div style={{ color: 'var(--foreground)' }}>{customer?.email}</div>
          </div>
          <div className="col-span-2">
            <div className="text-xs" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' }}>ID Proof</div>
            <div style={{ color: 'var(--foreground)' }}>{customer?.idProof}</div>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          {customer?.phone && (
            <a href={`tel:${customer.phone}`} className="px-3 py-1.5 rounded text-xs font-medium" style={{ background: 'var(--secondary)', color: 'var(--secondary-foreground)' }}>Call</a>
          )}
          {whatsappChatUrl && (
            <a href={whatsappChatUrl} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded text-xs font-medium" style={{ background: '#25D366', color: 'white' }}>WhatsApp</a>
          )}
          <button onClick={() => onNavigate('customer-detail', { customerId: booking.customerId })} className="px-3 py-1.5 rounded text-xs font-medium" style={{ background: 'var(--secondary)', color: 'var(--secondary-foreground)' }}>
            Full Profile →
          </button>
        </div>
      </div>

      <div className="rounded-lg overflow-hidden mb-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Charges & catalogue purchases</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Room stay, extra beds, and items bought by guests</p>
          </div>
          {canEditCharges && (
            <button
              onClick={() => setShowAddForm(v => !v)}
              className="text-xs px-3 py-1.5 rounded font-medium"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              {showAddForm ? 'Cancel' : '+ Add catalogue item'}
            </button>
          )}
        </div>

        {showAddForm && canEditCharges && !vacatePanel && (
          <div className="px-5 py-4 flex flex-wrap gap-3 items-end" style={{ borderBottom: '1px solid var(--border)', background: 'var(--secondary)' }}>
            <div className="flex-1 min-w-48">
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Item</label>
              <select
                value={addItem}
                onChange={e => setAddItem(e.target.value)}
                className="w-full px-3 py-2 rounded text-sm outline-none"
                style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              >
                <option value="">Select item…</option>
                {houseCatalogue.map(i => <option key={i.itemId} value={i.itemId}>{i.name} — {formatCurrency(i.price)}</option>)}
              </select>
            </div>
            <div className="w-24">
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Qty</label>
              <input
                type="number"
                min={1}
                value={addQty}
                onChange={e => setAddQty(Number(e.target.value))}
                className="w-full px-3 py-2 rounded text-sm outline-none"
                style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              />
            </div>
            <button
              onClick={handleAddPurchase}
              disabled={saving || !addItem}
              className="px-4 py-2 rounded text-sm font-semibold disabled:opacity-50"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              Add
            </button>
            {houseCatalogue.length === 0 && (
              <p className="w-full text-xs" style={{ color: 'var(--status-occupied)' }}>No catalogue for this property yet.</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <div className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>Room {room?.roomNumber} — {room?.type}</div>
            <div className="text-xs" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace' }}>{formatCurrency(booking.rent)} × {nights} nights</div>
          </div>
          <div className="text-sm font-medium" style={{ color: 'var(--foreground)', fontFamily: 'DM Mono, monospace' }}>{formatCurrency(roomTotal)}</div>
        </div>

        {discount > 0 && (
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <div className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>Discount</div>
              <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Applied on room stay</div>
            </div>
            <div className="text-sm font-medium" style={{ color: 'var(--status-vacant)', fontFamily: 'DM Mono, monospace' }}>−{formatCurrency(discount)}</div>
          </div>
        )}

        {extraBedsUsed > 0 && (
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <div className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>Extra bed{extraBedsUsed === 1 ? '' : 's'}</div>
              <div className="text-xs" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace' }}>
                {extraBedsUsed} × {formatCurrency(extraBedRate)} × {nights} nights
              </div>
            </div>
            <div className="text-sm font-medium" style={{ color: 'var(--foreground)', fontFamily: 'DM Mono, monospace' }}>{formatCurrency(extraBedTotal)}</div>
          </div>
        )}

        {purchases.map(p => {
          const item = getCatalogueItem(p.itemId);
          return (
            <div key={p.purchaseId} className="flex items-center justify-between px-5 py-3 gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="min-w-0 flex-1">
                <div className="text-sm" style={{ color: 'var(--foreground)' }}>{item?.name ?? p.itemId}</div>
                <div className="text-xs" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace' }}>
                  {formatCurrency(p.price)} × {p.quantity} &nbsp;·&nbsp; {new Date(p.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </div>
              </div>
              <div className="text-sm flex-shrink-0" style={{ color: 'var(--foreground)', fontFamily: 'DM Mono, monospace' }}>{formatCurrency(p.price * p.quantity)}</div>
              {canEditCharges && (
                <button
                  type="button"
                  onClick={() => handleDeletePurchase(p)}
                  className="text-xs flex-shrink-0"
                  style={{ color: 'var(--status-occupied)' }}
                >
                  Remove
                </button>
              )}
            </div>
          );
        })}

        {purchases.length === 0 && (
          <div className="px-5 py-3 text-xs" style={{ color: 'var(--muted-foreground)', borderBottom: '1px solid var(--border)' }}>
            No catalogue purchases recorded yet. Use “+ Add catalogue item” or Vacate & Bill to add them.
          </div>
        )}

        <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--secondary)' }}>
          <div className="flex items-center justify-between gap-3 mb-2">
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Payments received</div>
              <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                Advances and partial payments applied to the bill
              </div>
            </div>
            {canRecordPayment && (
              <button
                type="button"
                onClick={() => setShowPayForm(v => !v)}
                className="text-xs px-3 py-1.5 rounded font-medium"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                {showPayForm ? 'Cancel' : '+ Add payment'}
              </button>
            )}
          </div>

          {showPayForm && canRecordPayment && (
            <div className="flex flex-wrap gap-3 items-end mb-3">
              <div className="w-36">
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Amount (₹)</label>
                <input
                  type="number"
                  min={1}
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded text-sm outline-none"
                  style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                  placeholder="e.g. 2000"
                />
              </div>
              <div className="flex-1 min-w-40">
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Note (optional)</label>
                <input
                  type="text"
                  value={payNote}
                  onChange={e => setPayNote(e.target.value)}
                  className="w-full px-3 py-2 rounded text-sm outline-none"
                  style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                  placeholder="Advance / UPI / Cash"
                />
              </div>
              <button
                type="button"
                onClick={handleAddPayment}
                disabled={saving || !payAmount}
                className="px-4 py-2 rounded text-sm font-semibold disabled:opacity-50"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                Save payment
              </button>
            </div>
          )}

          {payments.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>No payments recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {payments.map(p => (
                <div key={p.paymentId} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm" style={{ color: 'var(--foreground)', fontFamily: 'DM Mono, monospace' }}>
                      {formatCurrency(p.amount)}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      {formatDate(p.paidAt.slice(0, 10))}
                      {p.note ? ` · ${p.note}` : ''}
                    </div>
                  </div>
                  {canRecordPayment && (
                    <button
                      type="button"
                      onClick={() => handleRemovePayment(p.paymentId)}
                      className="text-xs flex-shrink-0"
                      style={{ color: 'var(--status-occupied)' }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-4 space-y-1.5" style={{ background: 'var(--secondary)' }}>
          <div className="flex items-center justify-between">
            <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Room</div>
            <div className="text-sm" style={{ fontFamily: 'DM Mono, monospace', color: 'var(--foreground)' }}>{formatCurrency(roomCharge)}</div>
          </div>
          <div className="flex items-center justify-between pl-2">
            <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>GST 12% (room)</div>
            <div className="text-xs" style={{ fontFamily: 'DM Mono, monospace', color: 'var(--foreground)' }}>{formatCurrency(roomTax)}</div>
          </div>
          {extraBedTotal > 0 && (
            <>
              <div className="flex items-center justify-between">
                <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Extra guests</div>
                <div className="text-sm" style={{ fontFamily: 'DM Mono, monospace', color: 'var(--foreground)' }}>{formatCurrency(extraBedTotal)}</div>
              </div>
              <div className="flex items-center justify-between pl-2">
                <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>GST 12% (extra guests)</div>
                <div className="text-xs" style={{ fontFamily: 'DM Mono, monospace', color: 'var(--foreground)' }}>{formatCurrency(extraBedTax)}</div>
              </div>
            </>
          )}
          {purchases.map((p, i) => {
            const amount = p.price * p.quantity;
            const label = getCatalogueItem(p.itemId)?.name ?? p.itemId;
            return (
              <div key={p.purchaseId}>
                <div className="flex items-center justify-between">
                  <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{label} × {p.quantity}</div>
                  <div className="text-sm" style={{ fontFamily: 'DM Mono, monospace', color: 'var(--foreground)' }}>{formatCurrency(amount)}</div>
                </div>
                <div className="flex items-center justify-between pl-2">
                  <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>GST 12%</div>
                  <div className="text-xs" style={{ fontFamily: 'DM Mono, monospace', color: 'var(--foreground)' }}>{formatCurrency(purchaseTaxes[i] ?? 0)}</div>
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between pt-1" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Charges (ex. GST)</div>
            <div className="text-sm" style={{ fontFamily: 'DM Mono, monospace', color: 'var(--foreground)' }}>{formatCurrency(grandTotal)}</div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Total GST</div>
            <div className="text-sm" style={{ fontFamily: 'DM Mono, monospace', color: 'var(--foreground)' }}>{formatCurrency(taxEstimate)}</div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Bill total</div>
            <div className="text-lg font-semibold" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--foreground)' }}>{formatCurrency(totalWithTaxEstimate)}</div>
          </div>
          {amountPaid > 0 && (
            <>
              <div className="flex items-center justify-between pt-1" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="text-sm" style={{ color: 'var(--status-vacant)' }}>Paid already</div>
                <div className="text-sm" style={{ fontFamily: 'DM Mono, monospace', color: 'var(--status-vacant)' }}>−{formatCurrency(amountPaid)}</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>Balance due</div>
                <div className="text-xl font-semibold" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--foreground)' }}>{formatCurrency(balanceDue)}</div>
              </div>
            </>
          )}
        </div>
      </div>

      {checkedOut && (
        <div className="rounded-lg p-5 flex items-center justify-between gap-4 flex-wrap" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div>
            <div className="text-sm font-semibold mb-0.5" style={{ color: 'var(--foreground)' }}>
              {booking.paid ? 'Bill Paid' : 'Bill Ready'}
            </div>
            <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              {booking.paid
                ? `Marked paid${booking.paidAt ? ` · ${formatDate(booking.paidAt.slice(0, 10))}` : ''}`
                : 'Share with guest via WhatsApp or mark as paid when settled'}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {!booking.paid && (
              <button
                onClick={handleMarkPaid}
                disabled={saving}
                className="px-3 py-2 rounded text-xs font-medium disabled:opacity-60"
                style={{ background: 'var(--status-vacant)', color: 'white' }}
              >
                Mark as Paid
              </button>
            )}
            <button
              onClick={() => onNavigate('public-bill', { token: booking.shareToken || bookingId, bookingId })}
              className="px-3 py-2 rounded text-xs font-medium"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              View Bill
            </button>
            {billUrl && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(billUrl);
                    toast.success('Bill link copied.');
                  } catch {
                    toast.error('Could not copy link.');
                  }
                }}
                className="px-3 py-2 rounded text-xs font-medium"
                style={{ background: 'var(--secondary)', color: 'var(--secondary-foreground)' }}
              >
                Copy link
              </button>
            )}
            {whatsappBillUrl ? (
              <a href={whatsappBillUrl} target="_blank" rel="noreferrer" className="px-3 py-2 rounded text-xs font-medium" style={{ background: '#25D366', color: 'white' }}>
                WhatsApp bill
              </a>
            ) : (
              <button
                type="button"
                disabled
                title={!shareToken ? 'Complete Vacate & Bill first' : 'Guest phone number missing'}
                className="px-3 py-2 rounded text-xs font-medium opacity-50 cursor-not-allowed"
                style={{ background: '#25D366', color: 'white' }}
              >
                WhatsApp bill
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
