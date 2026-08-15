import { useEffect, useState } from 'react';
import type { User, House, Customer, Booking } from '../data/types';
import { formatCurrency, calcExtraBedsNeeded, calcExtraBedTotal } from '../data/types';
import { useCollection, useHouseRooms } from '../lib/firebase/hooks';
import { getConflictingBooking } from '../lib/availability';
import { db } from '../lib/firebase/config';
import { doc, setDoc } from 'firebase/firestore';
import type { Page } from '../components/Layout';
import { filterHousesByAccess } from '@/lib/permissions';
import { createBookingAtomic } from '@/lib/bookingService';
import { createId } from '@/lib/ids';
import { useToast } from '@/components/ToastProvider';

interface Props {
  currentUser: User;
  initialHouseId?: string;
  initialRoomId?: string;
  initialCheckIn?: string;
  initialCheckOut?: string;
  onNavigate: (page: Page, params?: Record<string, string>) => void;
}

type RoomConfig = {
  nightlyRate: number;
  discount: number;
  guestCount: number | '';
  extraBedRate: number;
};

export default function BookingNew({
  currentUser,
  initialHouseId,
  initialRoomId,
  initialCheckIn,
  initialCheckOut,
  onNavigate,
}: Props) {
  const toast = useToast();
  const { data: allHouses, loading: housesLoading } = useCollection<House>('houses');
  const { data: CUSTOMERS, loading: customersLoading } = useCollection<Customer>('customers');
  const { data: BOOKINGS } = useCollection<Booking>('bookings');

  const accessibleHouses = filterHousesByAccess(currentUser, allHouses);

  const [houseId, setHouseId] = useState(initialHouseId ?? '');
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>(initialRoomId ? [initialRoomId] : []);
  const [roomConfigs, setRoomConfigs] = useState<Record<string, RoomConfig>>({});

  const [customerId, setCustomerId] = useState('');
  const [guestMode, setGuestMode] = useState<'existing' | 'new'>('existing');
  const [newGuest, setNewGuest] = useState({ name: '', phone: '', email: '', idProof: '' });
  const [checkIn, setCheckIn] = useState(initialCheckIn ?? new Date().toISOString().split('T')[0]);
  const [checkOut, setCheckOut] = useState(initialCheckOut ?? '');
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!houseId && accessibleHouses[0]) {
      setHouseId(initialHouseId ?? accessibleHouses[0].houseId);
    }
  }, [accessibleHouses, houseId, initialHouseId]);

  const { data: rooms, loading: roomsLoading } = useHouseRooms(houseId || null);

  // Auto-initialize config if initialRoomId is set and rooms are loaded
  useEffect(() => {
    if (initialRoomId && rooms.length > 0 && !roomConfigs[initialRoomId]) {
      const r = rooms.find((rm) => rm.roomId === initialRoomId);
      if (r) {
        setRoomConfigs((prev) => ({
          ...prev,
          [r.roomId]: {
            nightlyRate: r.rent,
            discount: 0,
            guestCount: 1,
            extraBedRate: r.costPerBed ?? 0,
          },
        }));
      }
    }
  }, [initialRoomId, rooms, roomConfigs]);

  const nights = checkOut && checkIn ? Math.max(1, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24))) : 0;
  const selectedHouse = allHouses.find(h => h.houseId === houseId);

  const toggleRoom = (r: typeof rooms[0]) => {
    setSelectedRoomIds(prev => {
      if (prev.includes(r.roomId)) {
        return prev.filter(id => id !== r.roomId);
      }
      return [...prev, r.roomId];
    });
    setRoomConfigs(prev => {
      if (prev[r.roomId]) return prev;
      return {
        ...prev,
        [r.roomId]: {
          nightlyRate: r.rent,
          discount: 0,
          guestCount: 1,
          extraBedRate: r.costPerBed ?? 0,
        }
      };
    });
  };

  const updateRoomConfig = (roomId: string, updates: Partial<RoomConfig>) => {
    setRoomConfigs(prev => ({
      ...prev,
      [roomId]: { ...prev[roomId], ...updates }
    }));
  };

  const calculateRoomTotals = (roomId: string, config: RoomConfig) => {
    const r = rooms.find((rm) => rm.roomId === roomId);
    if (!r) return null;

    const bedsAvailable = r.extraBeds ?? 0;
    const maxGuests = r.maxOccupancy + bedsAvailable;
    const extraBedsUsed = calcExtraBedsNeeded(Number(config.guestCount) || 1, r.maxOccupancy, bedsAvailable);
    const overCapacity = (Number(config.guestCount) || 1) > maxGuests;

    const roomTotal = config.nightlyRate * nights;
    const discountAmount = Math.min(Math.max(0, config.discount), roomTotal);
    const roomAfterDiscount = Math.max(0, roomTotal - discountAmount);
    const extraBedTotal = calcExtraBedTotal(extraBedsUsed, config.extraBedRate, nights);
    const total = roomAfterDiscount + extraBedTotal;

    return {
      r,
      bedsAvailable,
      maxGuests,
      extraBedsUsed,
      overCapacity,
      roomTotal,
      discountAmount,
      roomAfterDiscount,
      extraBedTotal,
      total,
    };
  };

  const anyOverCapacity = selectedRoomIds.some(id => {
    const config = roomConfigs[id];
    if (!config) return false;
    const totals = calculateRoomTotals(id, config);
    return totals?.overCapacity ?? false;
  });

  const grandTotal = selectedRoomIds.reduce((sum, id) => {
    const config = roomConfigs[id];
    if (!config) return sum;
    const totals = calculateRoomTotals(id, config);
    return sum + (totals?.total ?? 0);
  }, 0);

  const totalGuests = selectedRoomIds.reduce((sum, id) => {
    const config = roomConfigs[id];
    return sum + (Number(config?.guestCount) || 1);
  }, 0);

  if (housesLoading || customersLoading || roomsLoading) {
    return <div className="p-8 text-center" style={{ color: 'var(--muted-foreground)' }}>Loading…</div>;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (anyOverCapacity || selectedRoomIds.length === 0) return;
    if (checkOut <= checkIn) {
      toast.error('Check-out must be after check-in.');
      return;
    }
    setSubmitting(true);
    try {
      let resolvedCustomerId = customerId;

      if (guestMode === 'new' && newGuest.name) {
        const customerDocId = createId('c');
        await setDoc(doc(db, 'customers', customerDocId), {
          customerId: customerDocId,
          name: newGuest.name.trim(),
          phone: newGuest.phone.trim(),
          email: newGuest.email.trim(),
          idProof: newGuest.idProof.trim(),
          bookingHistory: [],
        });
        resolvedCustomerId = customerDocId;
      }

      if (!resolvedCustomerId || selectedRoomIds.length === 0 || !houseId || !checkIn || !checkOut) {
        toast.error('Fill in guest, room, and stay dates.');
        setSubmitting(false);
        return;
      }

      // Create booking for each selected room
      await Promise.all(
        selectedRoomIds.map(async (roomId) => {
          const config = roomConfigs[roomId];
          const room = rooms.find(r => r.roomId === roomId);
          if (!config || !room) return;

          const totals = calculateRoomTotals(roomId, config);
          if (!totals) return;

          return createBookingAtomic(db, {
            houseId,
            roomId,
            customerId: resolvedCustomerId,
            checkIn,
            checkOut,
            rent: Number(config.nightlyRate) || 0,
            discount: totals.discountAmount,
            guestCount: Math.max(1, Number(config.guestCount) || 1),
            extraBedsUsed: totals.extraBedsUsed,
            extraBedRate: totals.extraBedsUsed > 0 ? Math.max(0, Number(config.extraBedRate) || 0) : 0,
            notes,
            roomCurrentStatus: room.currentStatus,
          });
        })
      );

      toast.success(selectedRoomIds.length > 1 ? 'Bookings confirmed.' : 'Booking confirmed.');
      setSaved(true);
      setTimeout(() => onNavigate('bookings'), 1200);
    } catch (err: any) {
      console.error('Error creating booking:', err);
      toast.error(err?.message || 'Could not create booking.');
      setSubmitting(false);
    }
  };

  if (saved) {
    return (
      <div className="flex items-center justify-center min-h-screen p-8" style={{ background: 'var(--background)' }}>
        <div className="text-center">
          <div className="text-4xl mb-4" style={{ color: 'var(--status-vacant)' }}>✓</div>
          <h2 className="text-2xl mb-2" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--foreground)' }}>Booking Confirmed</h2>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Redirecting to bookings list…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto">
      <button className="text-sm mb-5 flex items-center gap-1" style={{ color: 'var(--muted-foreground)' }} onClick={() => onNavigate('bookings')}>
        ← Bookings
      </button>

      <h1 className="text-3xl mb-6" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--foreground)' }}>New Booking</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-lg p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--foreground)' }}>Stay Dates</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' }}>Check-in</label>
              <input
                type="date"
                value={checkIn}
                onChange={e => { setCheckIn(e.target.value); setSelectedRoomIds([]); }}
                required
                className="w-full px-3 py-2 rounded text-sm outline-none"
                style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' }}>Check-out</label>
              <input
                type="date"
                value={checkOut}
                onChange={e => { setCheckOut(e.target.value); setSelectedRoomIds([]); }}
                required
                className="w-full px-3 py-2 rounded text-sm outline-none"
                style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--foreground)' }}>Property & Room Selection</h2>
          <div className="mb-4">
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' }}>Property</label>
            <select
              value={houseId}
              onChange={e => { setHouseId(e.target.value); setSelectedRoomIds([]); }}
              required
              className="w-full px-3 py-2 rounded text-sm outline-none"
              style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
            >
              {accessibleHouses.map(h => <option key={h.houseId} value={h.houseId}>{h.name}</option>)}
            </select>
          </div>

          {checkIn && checkOut && (
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' }}>Available Rooms</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                {rooms.map(r => {
                  const conflict = getConflictingBooking(r.roomId, checkIn, checkOut, BOOKINGS);
                  const isAvailable = !conflict && r.currentStatus !== 'maintenance';
                  const isSelected = selectedRoomIds.includes(r.roomId);

                  return (
                    <div
                      key={r.roomId}
                      onClick={() => isAvailable && toggleRoom(r)}
                      className={`p-4 rounded-lg border transition-all ${
                        !isAvailable ? 'opacity-60 bg-black/5 dark:bg-white/5 cursor-not-allowed' :
                        isSelected ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/5 cursor-pointer' :
                        'border-[color:var(--border)] hover:border-[color:var(--foreground)] cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-sm">Room {r.roomNumber}</div>
                        {isAvailable && (
                          <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-[color:var(--accent)] border-[color:var(--accent)]' : 'border-[color:var(--border)]'}`}>
                            {isSelected && <svg viewBox="0 0 14 14" fill="none" className="w-3 h-3 text-white"><path d="M3 7.5L5.5 10L11 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </div>
                        )}
                      </div>
                      <div className="text-xs mt-1.5" style={{ color: 'var(--muted-foreground)' }}>
                        {r.type} · {formatCurrency(r.rent)}/night
                      </div>
                      <div className="text-xs mt-0.5 opacity-80">
                        Max {r.maxOccupancy + (r.extraBeds ?? 0)} guests
                      </div>
                      {!isAvailable && conflict && (
                        <div className="text-xs mt-2 font-medium" style={{ color: 'var(--status-occupied)' }}>
                          Occupied ({conflict.checkIn} to {conflict.checkOut})
                        </div>
                      )}
                      {!isAvailable && !conflict && r.currentStatus === 'maintenance' && (
                        <div className="text-xs mt-2 font-medium" style={{ color: 'var(--status-maintenance)' }}>
                          Under Maintenance
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {selectedRoomIds.length === 0 && (
                <p className="text-xs mt-3 text-red-500">Please select at least one room.</p>
              )}
            </div>
          )}
        </div>

        {selectedRoomIds.map(roomId => {
          const config = roomConfigs[roomId];
          if (!config) return null;
          const totals = calculateRoomTotals(roomId, config);
          if (!totals) return null;
          const { r, maxGuests, bedsAvailable, extraBedsUsed, overCapacity, roomTotal } = totals;

          return (
            <div key={roomId} className="rounded-lg p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--foreground)' }}>Room {r.roomNumber} Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' }}>Room rate / night (₹)</label>
                  <input
                    type="number"
                    min={0}
                    value={config.nightlyRate || ''}
                    onChange={e => updateRoomConfig(roomId, { nightlyRate: Number(e.target.value) })}
                    required
                    className="w-full px-3 py-2 rounded text-sm outline-none"
                    style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)', fontFamily: 'DM Mono, monospace' }}
                  />
                  <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                    Listed {formatCurrency(r.rent)}/night
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' }}>Discount on stay (₹)</label>
                  <input
                    type="number"
                    min={0}
                    max={roomTotal || undefined}
                    value={config.discount || ''}
                    onChange={e => updateRoomConfig(roomId, { discount: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-full px-3 py-2 rounded text-sm outline-none"
                    style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)', fontFamily: 'DM Mono, monospace' }}
                  />
                  <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                    Flat amount off room total
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' }}>Number of guests</label>
                  <input
                    type="number"
                    min={1}
                    max={maxGuests}
                    value={config.guestCount}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === '') {
                        updateRoomConfig(roomId, { guestCount: '' });
                      } else {
                        const next = Math.max(1, Number(val) || 1);
                        updateRoomConfig(roomId, { guestCount: Math.min(next, maxGuests) });
                      }
                    }}
                    required
                    className="w-full px-3 py-2 rounded text-sm outline-none"
                    style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                  />
                  <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                    Max {maxGuests} ({r.maxOccupancy} included
                    {bedsAvailable > 0 ? ` + ${bedsAvailable} extra bed${bedsAvailable === 1 ? '' : 's'}` : ''})
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' }}>Extra beds needed</label>
                  <div
                    className="w-full px-3 py-2 rounded text-sm"
                    style={{ background: 'var(--secondary)', border: '1px solid var(--border)', color: 'var(--foreground)', fontFamily: 'DM Mono, monospace' }}
                  >
                    {extraBedsUsed}
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                    {extraBedsUsed > 0
                      ? `${extraBedsUsed} guest${extraBedsUsed === 1 ? '' : 's'} beyond room capacity`
                      : 'Only charged when guests exceed room capacity'}
                  </p>
                </div>
                {extraBedsUsed > 0 && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' }}>Extra bed cost / night (₹)</label>
                    <input
                      type="number"
                      min={0}
                      value={config.extraBedRate || ''}
                      onChange={e => updateRoomConfig(roomId, { extraBedRate: Math.max(0, Number(e.target.value) || 0) })}
                      className="w-full px-3 py-2 rounded text-sm outline-none"
                      style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)', fontFamily: 'DM Mono, monospace' }}
                    />
                    <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                      Room default {formatCurrency(r.costPerBed ?? 0)}/bed/night — editable for this booking
                    </p>
                  </div>
                )}
              </div>

              {overCapacity && (
                <p className="mt-4 text-sm font-medium" style={{ color: 'var(--status-occupied)' }}>
                  Too many guests for this room (max {maxGuests}).
                </p>
              )}
            </div>
          );
        })}

        <div className="rounded-lg p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Primary Guest</h2>
            <div className="flex gap-1">
              {(['existing', 'new'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setGuestMode(m)}
                  className="px-3 py-1 rounded text-xs font-medium transition-all"
                  style={guestMode === m
                    ? { background: 'var(--primary)', color: 'var(--primary-foreground)' }
                    : { background: 'var(--secondary)', color: 'var(--secondary-foreground)' }
                  }
                >
                  {m === 'existing' ? 'Existing' : 'New Guest'}
                </button>
              ))}
            </div>
          </div>

          {guestMode === 'existing' ? (
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' }}>Select Guest</label>
              <select
                value={customerId}
                onChange={e => setCustomerId(e.target.value)}
                required
                className="w-full px-3 py-2 rounded text-sm outline-none"
                style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              >
                <option value="">Select guest…</option>
                {CUSTOMERS.map(c => <option key={c.customerId} value={c.customerId}>{c.name} — {c.phone}</option>)}
              </select>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: 'name', label: 'Full Name', placeholder: 'Anjali Menon' },
                { key: 'phone', label: 'Phone', placeholder: '+91 98455 12034' },
                { key: 'email', label: 'Email', placeholder: 'anjali@example.com' },
                { key: 'idProof', label: 'ID Proof', placeholder: 'Aadhaar / Passport / DL' },
              ].map(field => (
                <div key={field.key}>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' }}>{field.label}</label>
                  <input
                    type="text"
                    value={newGuest[field.key as keyof typeof newGuest]}
                    onChange={e => setNewGuest({ ...newGuest, [field.key]: e.target.value })}
                    placeholder={field.placeholder}
                    className="w-full px-3 py-2 rounded text-sm outline-none"
                    style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' }}>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Any special requests…"
            className="w-full px-3 py-2 rounded text-sm outline-none resize-none"
            style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
          />
        </div>

        {selectedRoomIds.length > 0 && (
          <div className="rounded-lg p-4" style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
            <div className="text-xs mb-2 opacity-70" style={{ fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' }}>Booking Summary</div>
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-lg font-semibold" style={{ fontFamily: 'DM Serif Display, serif' }}>{selectedHouse?.name}</div>
                <div className="text-sm opacity-80">{checkIn} → {checkOut} · {nights} nights</div>
                <div className="text-sm opacity-80 mt-1">
                  {selectedRoomIds.length} Room{selectedRoomIds.length === 1 ? '' : 's'} · {totalGuests} Guest{totalGuests === 1 ? '' : 's'}
                </div>
                
                {/* Breakdown per room */}
                <div className="mt-3 space-y-2">
                  {selectedRoomIds.map(roomId => {
                    const config = roomConfigs[roomId];
                    if (!config) return null;
                    const totals = calculateRoomTotals(roomId, config);
                    if (!totals) return null;
                    
                    return (
                      <div key={roomId} className="text-xs flex flex-col gap-1 opacity-70 pb-2 border-b border-white/10 last:border-0 last:pb-0">
                        <div className="flex justify-between gap-4">
                          <span>Room {totals.r.roomNumber} ({formatCurrency(config.nightlyRate)} × {nights})</span>
                          <span style={{ fontFamily: 'DM Mono, monospace' }}>{formatCurrency(totals.roomTotal)}</span>
                        </div>
                        {totals.extraBedsUsed > 0 && (
                          <div className="flex justify-between gap-4 pl-2">
                            <span>↳ Extra guests ({totals.extraBedsUsed} × {formatCurrency(config.extraBedRate)} × {nights})</span>
                            <span style={{ fontFamily: 'DM Mono, monospace' }}>{formatCurrency(totals.extraBedTotal)}</span>
                          </div>
                        )}
                        {totals.discountAmount > 0 && (
                          <div className="flex justify-between gap-4 pl-2">
                            <span>↳ Discount</span>
                            <span style={{ fontFamily: 'DM Mono, monospace' }}>-{formatCurrency(totals.discountAmount)}</span>
                          </div>
                        )}
                        {(totals.extraBedsUsed > 0 || totals.discountAmount > 0) && (
                          <div className="flex justify-between gap-4 font-medium opacity-100 mt-1 pt-1 border-t border-white/10">
                            <span>Room {totals.r.roomNumber} Total</span>
                            <span style={{ fontFamily: 'DM Mono, monospace' }}>{formatCurrency(totals.total)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="text-2xl font-semibold self-end" style={{ fontFamily: 'DM Serif Display, serif' }}>
                {formatCurrency(grandTotal)}
              </div>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || anyOverCapacity || selectedRoomIds.length === 0}
          className="w-full py-3 rounded-md text-sm font-semibold disabled:opacity-60"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          {submitting ? 'Confirming…' : (selectedRoomIds.length > 1 ? `Confirm ${selectedRoomIds.length} Bookings` : 'Confirm Booking')}
        </button>
      </form>
    </div>
  );
}
