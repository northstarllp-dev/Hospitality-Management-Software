import { useMemo, useState } from 'react';
import type { User, House, Booking, Customer, Purchase, Room } from '../data/types';
import { formatCurrency, calcNights, calcBookingTotal } from '../data/types';
import { useAccessibleBookings, useAccessibleHouses, useAccessibleRooms, useCollection, useHouseRooms } from '../lib/firebase/hooks';
import { getRoomAvailability } from '../lib/availability';
import type { Page } from '../components/Layout';
import DataError from '@/components/DataError';

interface Props {
  currentUser: User;
  onNavigate: (page: Page, params?: Record<string, string>) => void;
}

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  'confirmed': { bg: '#EDF4FF', text: '#1A56B0' },
  'checked-in': { bg: 'var(--status-vacant-bg)', text: 'var(--status-vacant)' },
  'checked-out': { bg: 'var(--secondary)', text: 'var(--muted-foreground)' },
  'cancelled': { bg: 'var(--status-occupied-bg)', text: 'var(--status-occupied)' },
};

const AVAIL_STYLE = {
  available: { bg: 'var(--status-vacant-bg)', text: 'var(--status-vacant)', label: 'Available' },
  occupied: { bg: 'var(--status-occupied-bg)', text: 'var(--status-occupied)', label: 'Occupied' },
  maintenance: { bg: 'var(--status-maintenance-bg)', text: 'var(--status-maintenance)', label: 'Maintenance' },
};

export default function Bookings({ currentUser, onNavigate }: Props) {
  const { data: accessibleHouses, loading: housesLoading, error: housesError } = useAccessibleHouses<House>(currentUser);
  const { data: allBookings, loading: bookingsLoading, error: bookingsError } = useAccessibleBookings(currentUser);
  const { data: CUSTOMERS } = useCollection<Customer>('customers');
  const { data: allPurchases } = useCollection<Purchase>('purchases');
  const { data: allRooms } = useAccessibleRooms(currentUser);

  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const [calHouseId, setCalHouseId] = useState('');
  const effectiveCalHouse = calHouseId || accessibleHouses[0]?.houseId || '';
  const { data: calRooms } = useHouseRooms(view === 'calendar' ? effectiveCalHouse : null);

  const today = new Date().toISOString().split('T')[0];
  const [calDate, setCalDate] = useState(today);

  const nextDay = (ymd: string) => {
    const d = new Date(`${ymd}T12:00:00`);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  };

  const loading = housesLoading || bookingsLoading;

  let bookings = [...allBookings];

  if (statusFilter !== 'all') bookings = bookings.filter(b => b.status === statusFilter);
  if (search) {
    const s = search.toLowerCase();
    bookings = bookings.filter(b => {
      const c = CUSTOMERS.find(x => x.customerId === b.customerId);
      return c?.name.toLowerCase().includes(s) || b.bookingId.toLowerCase().includes(s);
    });
  }

  const purchaseTotalByBooking = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of allPurchases) {
      map.set(p.bookingId, (map.get(p.bookingId) ?? 0) + p.price * p.quantity);
    }
    return map;
  }, [allPurchases]);

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--muted-foreground)' }}>Loading bookings…</div>;

  const loadError = housesError || bookingsError;

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <DataError message={loadError} onRetry={() => window.location.reload()} />
      <div className="flex items-end justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl mb-1" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--foreground)' }}>Bookings</h1>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            {view === 'list' ? `${bookings.length} bookings` : 'Availability calendar'}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-md overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {(['list', 'calendar'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="px-3 py-2 text-xs font-medium"
                style={view === v
                  ? { background: 'var(--primary)', color: 'var(--primary-foreground)' }
                  : { background: 'var(--card)', color: 'var(--muted-foreground)' }
                }
              >
                {v === 'list' ? 'List' : 'Calendar'}
              </button>
            ))}
          </div>
          <button
            className="px-4 py-2 rounded-md text-sm font-semibold"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            onClick={() => onNavigate('booking-new')}
          >
            + New Booking
          </button>
        </div>
      </div>

      {view === 'calendar' ? (
        <div>
          <div className="flex flex-wrap gap-3 mb-5">
            <select
              value={effectiveCalHouse}
              onChange={e => setCalHouseId(e.target.value)}
              className="px-3 py-2 rounded-md text-sm outline-none"
              style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
            >
              {accessibleHouses.map(h => <option key={h.houseId} value={h.houseId}>{h.name}</option>)}
            </select>
            <input
              type="date"
              value={calDate}
              onChange={e => setCalDate(e.target.value)}
              className="px-3 py-2 rounded-md text-sm outline-none"
              style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
            />
          </div>

          <div className="flex gap-3 mb-4 text-xs">
            {Object.entries(AVAIL_STYLE).map(([k, v]) => (
              <span key={k} className="px-2 py-1 rounded-full font-medium" style={{ background: v.bg, color: v.text }}>{v.label}</span>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {calRooms.map((room: Room) => {
              const avail = getRoomAvailability(room, calDate, nextDay(calDate), allBookings);
              const style = AVAIL_STYLE[avail];
              return (
                <div
                  key={room.roomId}
                  className="rounded-lg p-4"
                  style={{ background: style.bg, border: '1px solid transparent' }}
                >
                  <div className="text-lg font-semibold mb-1" style={{ fontFamily: 'DM Serif Display, serif', color: style.text }}>
                    {room.roomNumber}
                  </div>
                  <div className="text-xs mb-1" style={{ color: style.text }}>{room.type}</div>
                  <div className="text-xs mb-3" style={{ color: style.text, opacity: 0.8, fontFamily: 'DM Mono, monospace' }}>
                    {formatCurrency(room.rent)}/night
                  </div>
                  <div className="text-xs font-medium mb-2" style={{ color: style.text }}>{style.label}</div>
                  {avail === 'available' && (
                    <button
                      className="w-full py-1.5 rounded text-xs font-semibold"
                      style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                      onClick={() => onNavigate('booking-new', {
                        houseId: effectiveCalHouse,
                        roomId: room.roomId,
                        checkIn: calDate,
                        checkOut: nextDay(calDate),
                      })}
                    >
                      Book
                    </button>
                  )}
                </div>
              );
            })}
            {calRooms.length === 0 && (
              <div className="col-span-full text-sm py-10 text-center" style={{ color: 'var(--muted-foreground)' }}>No rooms for this property.</div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3 mb-5">
            <input
              type="text"
              placeholder="Search guest name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 min-w-48 px-3 py-2 rounded-md text-sm outline-none"
              style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
            />
            <div className="flex gap-1.5">
              {['all', 'confirmed', 'checked-in', 'checked-out'].map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className="px-3 py-2 rounded-md text-xs font-medium transition-all"
                  style={statusFilter === s
                    ? { background: 'var(--primary)', color: 'var(--primary-foreground)' }
                    : { background: 'var(--secondary)', color: 'var(--secondary-foreground)' }
                  }
                >
                  {s === 'all' ? 'All' : s.replace('-', ' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            {bookings.length === 0 && (
              <div className="px-5 py-12 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>No bookings found.</div>
            )}

            {bookings.map((booking, i) => {
              const house = accessibleHouses.find(h => h.houseId === booking.houseId);
              const room = allRooms.find(r => r.roomId === booking.roomId && r.houseId === booking.houseId);
              const customer = CUSTOMERS.find(c => c.customerId === booking.customerId);
              const nights = calcNights(booking.checkIn, booking.checkOut);
              const purchaseLines = allPurchases.filter(p => p.bookingId === booking.bookingId);
              const total = calcBookingTotal(booking, purchaseLines);
              const sc = STATUS_STYLE[booking.status] || STATUS_STYLE['confirmed'];

              return (
                <div
                  key={booking.bookingId}
                  role="button"
                  tabIndex={0}
                  onClick={() => onNavigate('booking-detail', { bookingId: booking.bookingId })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onNavigate('booking-detail', { bookingId: booking.bookingId });
                    }
                  }}
                  className="w-full text-left transition-colors hover:bg-[var(--secondary)] cursor-pointer"
                  style={{ borderBottom: i < bookings.length - 1 ? '1px solid var(--border)' : 'none' }}
                >
                  <div className="sm:hidden px-5 py-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>{customer?.name ?? '—'}</span>
                      <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: sc.bg, color: sc.text }}>{booking.status.replace('-', ' ')}</span>
                    </div>
                    <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{house?.name} · Room {room?.roomNumber}</div>
                    <div className="flex items-center justify-between mt-1.5 gap-2">
                      <span className="text-xs" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace' }}>{booking.checkIn} → {booking.checkOut}</span>
                      <div className="flex items-center gap-2">
                        {(booking.status === 'confirmed' || booking.status === 'checked-in') && (
                          <button
                            type="button"
                            className="text-xs px-2 py-1 rounded font-medium"
                            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigate('booking-detail', { bookingId: booking.bookingId, addPurchase: '1' });
                            }}
                          >
                            + Purchase
                          </button>
                        )}
                        <span className="text-sm font-medium" style={{ color: 'var(--foreground)', fontFamily: 'DM Mono, monospace' }}>{formatCurrency(total)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="hidden sm:grid grid-cols-[1fr_1fr_auto_auto_auto_auto] gap-3 items-center px-5 py-3.5">
                    <div>
                      <div className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{customer?.name ?? '—'}</div>
                      <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{customer?.phone}</div>
                    </div>
                    <div>
                      <div className="text-sm" style={{ color: 'var(--foreground)' }}>{house?.name}</div>
                      <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Room {room?.roomNumber} · {room?.type}</div>
                    </div>
                    <div className="text-xs" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace', textAlign: 'right' }}>
                      <div>{booking.checkIn}</div>
                      <div>{booking.checkOut}</div>
                      <div className="mt-0.5">{nights}n</div>
                    </div>
                    <div className="text-sm font-medium text-right" style={{ color: 'var(--foreground)', fontFamily: 'DM Mono, monospace' }}>{formatCurrency(total)}</div>
                    <div>
                      <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: sc.bg, color: sc.text }}>{booking.status.replace('-', ' ')}</span>
                    </div>
                    <div>
                      {(booking.status === 'confirmed' || booking.status === 'checked-in') && (
                        <button
                          type="button"
                          className="text-xs px-2.5 py-1 rounded font-medium"
                          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigate('booking-detail', { bookingId: booking.bookingId, addPurchase: '1' });
                          }}
                        >
                          + Purchase
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
