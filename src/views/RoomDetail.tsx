import { useEffect, useState } from 'react';
import type { User, House, Booking, Customer, Room, RoomStatus } from '../data/types';
import { getActiveBookingForRoom, formatCurrency, calcNights, formatDate } from '../data/types';
import { useCollection, useHouseRooms, upsertRoom } from '../lib/firebase/hooks';
import type { Page } from '../components/Layout';
import { canEditRooms, canEditRoomRates } from '@/lib/permissions';
import { useToast } from '@/components/ToastProvider';

interface Props {
  currentUser: User;
  houseId: string;
  roomId: string;
  onNavigate: (page: Page, params?: Record<string, string>) => void;
}

export default function RoomDetail({ currentUser, houseId, roomId, onNavigate }: Props) {
  const toast = useToast();
  const { data: houses, loading: housesLoading } = useCollection<House>('houses');
  const { data: rooms, loading: roomsLoading } = useHouseRooms(houseId);
  const { data: BOOKINGS } = useCollection<Booking>('bookings');
  const { data: CUSTOMERS } = useCollection<Customer>('customers');

  const house = houses.find(h => h.houseId === houseId);
  const room = rooms.find(r => r.roomId === roomId);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    roomNumber: '',
    type: 'Double' as Room['type'],
    rent: 0,
    maxOccupancy: 1,
    extraBeds: 0,
    costPerBed: 0,
    floor: 1,
    currentStatus: 'vacant' as RoomStatus,
  });

  useEffect(() => {
    if (room) {
      setForm({
        roomNumber: room.roomNumber,
        type: room.type,
        rent: room.rent,
        maxOccupancy: room.maxOccupancy,
        extraBeds: room.extraBeds ?? 0,
        costPerBed: room.costPerBed ?? 0,
        floor: room.floor,
        currentStatus: room.currentStatus,
      });
    }
  }, [room?.roomId, room?.roomNumber, room?.type, room?.rent, room?.maxOccupancy, room?.extraBeds, room?.costPerBed, room?.floor, room?.currentStatus]);

  if (housesLoading || roomsLoading) {
    return <div className="p-8 text-center" style={{ color: 'var(--muted-foreground)' }}>Loading…</div>;
  }
  if (!house || !room) return <div className="p-8" style={{ color: 'var(--muted-foreground)' }}>Room not found.</div>;

  const activeBooking = getActiveBookingForRoom(BOOKINGS, roomId);
  const customer = activeBooking ? CUSTOMERS.find(c => c.customerId === activeBooking.customerId) : undefined;
  const bookingHistory = BOOKINGS.filter(b => b.roomId === roomId && b.status === 'checked-out').slice(0, 5);
  const canManage = canEditRooms(currentUser);
  const canEditRates = canEditRoomRates(currentUser);

  const STATUS_CONFIG = {
    vacant: { label: 'Vacant', color: 'var(--status-vacant)', bg: 'var(--status-vacant-bg)' },
    occupied: { label: 'Occupied', color: 'var(--status-occupied)', bg: 'var(--status-occupied-bg)' },
    maintenance: { label: 'Maintenance', color: 'var(--status-maintenance)', bg: 'var(--status-maintenance-bg)' },
  };
  const sc = STATUS_CONFIG[room.currentStatus];
  const inputStyle = { background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' } as const;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setSaving(true);
    try {
      await upsertRoom({
        ...room,
        roomNumber: form.roomNumber.trim(),
        type: form.type,
        rent: canEditRates ? Number(form.rent) || 0 : room.rent,
        maxOccupancy: Number(form.maxOccupancy) || 1,
        extraBeds: Number(form.extraBeds) || 0,
        costPerBed: canEditRates ? Number(form.costPerBed) || 0 : (room.costPerBed ?? 0),
        floor: Number(form.floor) || 1,
        currentStatus: form.currentStatus,
      });
      setEditing(false);
      toast.success('Room updated.');
    } catch (err) {
      console.error(err);
      toast.error('Could not save room.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <button className="text-sm mb-5 flex items-center gap-1" style={{ color: 'var(--muted-foreground)' }} onClick={() => onNavigate('house-detail', { houseId })}>
        ← {house.name}
      </button>

      <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl mb-1" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--foreground)' }}>Room {room.roomNumber}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              {room.type} · {room.maxOccupancy} people · {(room.extraBeds ?? 0)} extra beds
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canManage && (
            <button
              className="px-4 py-2 rounded-md text-sm font-semibold"
              style={{ background: editing ? 'var(--secondary)' : 'var(--accent)', color: editing ? 'var(--foreground)' : 'white' }}
              onClick={() => setEditing(v => !v)}
            >
              {editing ? 'Cancel' : 'Edit Room'}
            </button>
          )}
          {activeBooking && (
            <button
              className="px-4 py-2 rounded-md text-sm font-semibold"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              onClick={() => onNavigate('booking-detail', { bookingId: activeBooking.bookingId })}
            >
              View Booking
            </button>
          )}
          {!activeBooking && room.currentStatus === 'vacant' && (
            <button
              className="px-4 py-2 rounded-md text-sm font-semibold"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              onClick={() => onNavigate('booking-new', { houseId, roomId })}
            >
              Book
            </button>
          )}
        </div>
      </div>

      {editing && canManage ? (
        <form onSubmit={handleSave} className="rounded-lg p-5 mb-5 space-y-3" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--foreground)' }}>Edit Room</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Room number</label>
              <input required value={form.roomNumber} onChange={e => setForm({ ...form, roomNumber: e.target.value })} className="w-full px-3 py-2 rounded text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Type</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as Room['type'] })} className="w-full px-3 py-2 rounded text-sm outline-none" style={inputStyle}>
                <option value="Single">Single</option>
                <option value="Double">Double</option>
                <option value="Deluxe">Deluxe</option>
                <option value="Suite">Suite</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Rent / night</label>
              <input type="number" min={0} disabled={!canEditRates} value={form.rent} onChange={e => setForm({ ...form, rent: Number(e.target.value) })} className="w-full px-3 py-2 rounded text-sm outline-none disabled:opacity-60" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>People accommodated</label>
              <input type="number" min={1} value={form.maxOccupancy} onChange={e => setForm({ ...form, maxOccupancy: Number(e.target.value) })} className="w-full px-3 py-2 rounded text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Extra beds</label>
              <input type="number" min={0} value={form.extraBeds} onChange={e => setForm({ ...form, extraBeds: Number(e.target.value) })} className="w-full px-3 py-2 rounded text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Cost per bed</label>
              <input type="number" min={0} disabled={!canEditRates} value={form.costPerBed} onChange={e => setForm({ ...form, costPerBed: Number(e.target.value) })} className="w-full px-3 py-2 rounded text-sm outline-none disabled:opacity-60" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Floor</label>
              <input type="number" min={1} value={form.floor} onChange={e => setForm({ ...form, floor: Number(e.target.value) })} className="w-full px-3 py-2 rounded text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Status</label>
              <select value={form.currentStatus} onChange={e => setForm({ ...form, currentStatus: e.target.value as RoomStatus })} className="w-full px-3 py-2 rounded text-sm outline-none" style={inputStyle}>
                <option value="vacant">Vacant</option>
                <option value="occupied">Occupied</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
          </div>
          <button type="submit" disabled={saving} className="px-4 py-2 rounded text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
            {saving ? 'Saving…' : 'Save Room'}
          </button>
        </form>
      ) : (
        <div className="rounded-lg p-5 mb-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--foreground)' }}>Room Configuration</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' }}>Nightly Rate</div>
              <span className="text-lg font-semibold" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--foreground)' }}>{formatCurrency(room.rent)}</span>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' }}>Status</div>
              <span className="text-sm font-medium" style={{ color: sc.color }}>{sc.label}</span>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' }}>Room Type</div>
              <div className="text-sm" style={{ color: 'var(--foreground)' }}>{room.type}</div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' }}>People Accommodated</div>
              <div className="text-sm" style={{ color: 'var(--foreground)' }}>{room.maxOccupancy}</div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' }}>Extra Beds</div>
              <div className="text-sm" style={{ color: 'var(--foreground)' }}>{room.extraBeds ?? 0}</div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' }}>Cost Per Bed</div>
              <div className="text-sm" style={{ color: 'var(--foreground)' }}>{formatCurrency(room.costPerBed ?? 0)}</div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' }}>Floor</div>
              <div className="text-sm" style={{ color: 'var(--foreground)' }}>{room.floor}</div>
            </div>
          </div>
        </div>
      )}

      {activeBooking && customer && (
        <div className="rounded-lg p-5 mb-5" style={{ background: 'var(--status-occupied-bg)', border: '1px solid rgba(192,57,43,0.2)' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--status-occupied)' }}>Current Guest</h2>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(192,57,43,0.1)', color: 'var(--status-occupied)' }}>
              {activeBooking.status.replace('-', ' ')}
            </span>
          </div>
          <div className="text-lg font-semibold mb-1" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--foreground)' }}>{customer.name}</div>
          <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{customer.phone}</div>
          <div className="text-sm mt-1" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace' }}>
            {formatDate(activeBooking.checkIn)} → {formatDate(activeBooking.checkOut)} · {calcNights(activeBooking.checkIn, activeBooking.checkOut)} nights
          </div>
          <button
            className="mt-3 px-3 py-1.5 rounded text-xs font-semibold"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            onClick={() => onNavigate('booking-detail', { bookingId: activeBooking.bookingId })}
          >
            Manage Booking →
          </button>
        </div>
      )}

      {bookingHistory.length > 0 && (
        <div className="rounded-lg overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Past Stays</h2>
          </div>
          {bookingHistory.map((b, i) => {
            const c = CUSTOMERS.find(x => x.customerId === b.customerId);
            return (
              <button
                key={b.bookingId}
                onClick={() => onNavigate('booking-detail', { bookingId: b.bookingId })}
                className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-[var(--secondary)] transition-colors"
                style={{ borderBottom: i < bookingHistory.length - 1 ? '1px solid var(--border)' : 'none' }}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{c?.name ?? '—'}</div>
                  <div className="text-xs" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace' }}>
                    {b.checkIn} → {b.checkOut}
                  </div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: 'var(--secondary)', color: 'var(--muted-foreground)' }}>checked out</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
