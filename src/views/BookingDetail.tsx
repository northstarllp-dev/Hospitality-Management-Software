import { useMemo, useState } from 'react';
import type { User, House, Booking, Customer, CatalogueItem, BillSnapshot, Purchase } from '../data/types';
import { formatCurrency, calcNights, formatDate, calcExtraBedTotal, calcBookingTotal } from '../data/types';
import { useCollection, useHouseRooms, usePurchasesByBooking } from '../lib/firebase/hooks';
import { db } from '../lib/firebase/config';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import type { Page } from '../components/Layout';
import { cancelBookingAtomic, checkInBookingAtomic, checkoutBookingAtomic } from '@/lib/bookingService';
import { createId } from '@/lib/ids';
import { useToast } from '@/components/ToastProvider';
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
  const checkedOut = booking.status === 'checked-out';
  const cancelled = booking.status === 'cancelled';
  const canEditCharges = !checkedOut && !cancelled && (booking.status === 'checked-in' || booking.status === 'confirmed');
  const canCancel = booking.status === 'confirmed' || booking.status === 'checked-in';

  const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
    'confirmed': { bg: '#EDF4FF', text: '#1A56B0' },
    'checked-in': { bg: 'var(--status-vacant-bg)', text: 'var(--status-vacant)' },
    'checked-out': { bg: 'var(--secondary)', text: 'var(--muted-foreground)' },
    'cancelled': { bg: 'var(--status-occupied-bg)', text: 'var(--status-occupied)' },
  };
  const sc = STATUS_STYLE[booking.status] || STATUS_STYLE['confirmed'];

  const sharePath = booking.shareToken || bookingId;
  const billUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/bill/${sharePath}`
    : `/bill/${sharePath}`;

  const guestPhone = customer?.phone?.replace(/[^0-9]/g, '') ?? '';
  const whatsappUrl = guestPhone
    ? `https://wa.me/${guestPhone}?text=${encodeURIComponent(
        `Hi ${customer?.name ?? 'guest'}, your stay at ${house?.name} (Room ${room?.roomNumber}) bill is ready. Total: ${formatCurrency(grandTotal)}. View bill: ${billUrl}`
      )}`
    : null;

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

  const handleCheckout = async () => {
    setCheckingOut(true);
    try {
      const taxAmount = Math.round(grandTotal * 0.12);
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
        discount,
        guestCount: booking.guestCount,
        extraBedsUsed,
        extraBedRate,
        extraBedTotal,
        purchaseLines: purchases.map(p => ({
          label: getCatalogueItem(p.itemId)?.name ?? p.itemId,
          quantity: p.quantity,
          unitPrice: p.price,
          amount: p.price * p.quantity,
        })),
        purchaseTotal,
        subtotal: grandTotal,
        taxAmount,
        totalWithTax: grandTotal + taxAmount,
        createdAt: new Date().toISOString(),
        paid: false,
      };

      const { shareToken } = await checkoutBookingAtomic(
        db,
        booking,
        bill,
        room?.currentStatus ?? 'vacant'
      );
      setVacatePanel(false);
      toast.success('Checked out. Guest bill is ready.');
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
      await updateDoc(doc(db, 'bookings', bookingId), { paid: true, paidAt });
      await updateDoc(doc(db, 'bills', bookingId), { paid: true, paidAt }).catch(() => {});
      if (booking.shareToken) {
        await updateDoc(doc(db, 'publicBills', booking.shareToken), { paid: true, paidAt }).catch(() => {});
      }
      toast.success('Marked as paid.');
    } catch (e) {
      console.error(e);
      toast.error('Could not update payment status.');
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
              className="px-4 py-2 rounded-md text-sm font-semibold"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              Check In
            </button>
          )}
          {canEditCharges && (
            <button
              onClick={() => { setVacatePanel(true); setShowAddForm(true); }}
              className="px-4 py-2 rounded-md text-sm font-semibold"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              Vacate & Bill
            </button>
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
          {whatsappUrl && (
            <a href={whatsappUrl} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded text-xs font-medium" style={{ background: '#25D366', color: 'white' }}>WhatsApp</a>
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

        <div className="flex items-center justify-between px-5 py-4" style={{ background: 'var(--secondary)' }}>
          <div className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>Total</div>
          <div className="text-xl font-semibold" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--foreground)' }}>{formatCurrency(grandTotal)}</div>
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
            {whatsappUrl ? (
              <a href={whatsappUrl} target="_blank" rel="noreferrer" className="px-3 py-2 rounded text-xs font-medium" style={{ background: '#25D366', color: 'white' }}>
                WhatsApp
              </a>
            ) : (
              <button
                type="button"
                disabled
                title="Guest phone number missing"
                className="px-3 py-2 rounded text-xs font-medium opacity-50 cursor-not-allowed"
                style={{ background: '#25D366', color: 'white' }}
              >
                WhatsApp
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
