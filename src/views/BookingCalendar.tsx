import { useMemo, useState } from 'react';
import type { User, House, Booking, Customer, Room } from '../data/types';
import { formatCurrency, calcBookingTotal, formatDate } from '../data/types';
import type { Page } from '../components/Layout';

interface Props {
  currentUser: User;
  houses: House[];
  rooms: Room[];
  bookings: Booking[];
  customers: Customer[];
  purchases: { bookingId: string; price: number; quantity: number }[];
  onNavigate: (page: Page, params?: Record<string, string>) => void;
}

const STATUS_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  'confirmed': { bg: '#EDF4FF', text: '#1A56B0', dot: '#1A56B0' },
  'checked-in': { bg: 'var(--status-vacant-bg)', text: 'var(--status-vacant)', dot: 'var(--status-vacant)' },
  'checked-out': { bg: 'var(--secondary)', text: 'var(--muted-foreground)', dot: 'var(--muted-foreground)' },
  'cancelled': { bg: 'var(--status-occupied-bg)', text: 'var(--status-occupied)', dot: 'var(--status-occupied)' },
};

const WEEKDAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const toYmd = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const parseYmd = (ymd: string) => new Date(`${ymd}T12:00:00`);

function bookingsOnDay(ymd: string, bookings: Booking[]): Booking[] {
  return bookings.filter(b => b.checkIn <= ymd && ymd < b.checkOut && b.status !== 'cancelled');
}

function firstName(full?: string) {
  if (!full?.trim()) return 'Guest';
  return full.trim().split(/\s+/)[0];
}

export default function BookingCalendar({
  houses,
  rooms,
  bookings,
  customers,
  purchases,
  onNavigate,
}: Props) {
  const todayYmd = toYmd(new Date());
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [houseFilter, setHouseFilter] = useState('');
  const [roomFilter, setRoomFilter] = useState('');
  const [selectedDay, setSelectedDay] = useState<string>(todayYmd);

  const roomsForFilter = useMemo(() => {
    const list = houseFilter ? rooms.filter(r => r.houseId === houseFilter) : rooms;
    return [...list].sort((a, b) => String(a.roomNumber).localeCompare(String(b.roomNumber), undefined, { numeric: true }));
  }, [rooms, houseFilter]);

  const filteredBookings = useMemo(() => {
    return bookings.filter(b => {
      if (houseFilter && b.houseId !== houseFilter) return false;
      if (roomFilter && b.roomId !== roomFilter) return false;
      return true;
    });
  }, [bookings, houseFilter, roomFilter]);

  const purchaseTotalByBooking = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of purchases) {
      map.set(p.bookingId, (map.get(p.bookingId) ?? 0) + p.price * p.quantity);
    }
    return map;
  }, [purchases]);

  const roomByKey = useMemo(() => {
    const map = new Map<string, Room>();
    for (const r of rooms) {
      const id = r.roomId || (r as Room & { id?: string }).id;
      if (id) {
        map.set(`${r.houseId}:${id}`, r);
        if (!map.has(id)) map.set(id, r);
      }
    }
    return map;
  }, [rooms]);

  const gridDays = useMemo(() => {
    const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(firstOfMonth);
    start.setDate(start.getDate() - start.getDay());
    const days: { ymd: string; date: Date; inMonth: boolean; isToday: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const ymd = toYmd(d);
      days.push({
        ymd,
        date: d,
        inMonth: d.getMonth() === cursor.getMonth(),
        isToday: ymd === todayYmd,
      });
    }
    return days;
  }, [cursor, todayYmd]);

  const prevMonth = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
  const nextMonth = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
  const goToday = () => {
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDay(todayYmd);
  };

  const selectedBookings = bookingsOnDay(selectedDay, filteredBookings);

  const findHouse = (id: string) => houses.find(h => h.houseId === id);
  const findRoom = (houseId: string, roomId: string) =>
    roomByKey.get(`${houseId}:${roomId}`) || roomByKey.get(roomId);
  const findCustomer = (id: string) => customers.find(c => c.customerId === id);
  const roomNo = (b: Booking) => {
    const room = findRoom(b.houseId, b.roomId);
    return b.roomNumber || room?.roomNumber || '—';
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={prevMonth}
            className="w-9 h-9 sm:w-auto sm:px-3 sm:py-2 rounded-md text-lg sm:text-sm font-medium flex items-center justify-center"
            style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
            aria-label="Previous month"
          >
            ‹
          </button>
          <button
            onClick={goToday}
            className="px-3 py-2 rounded-md text-sm font-medium"
            style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
          >
            Today
          </button>
          <button
            onClick={nextMonth}
            className="w-9 h-9 sm:w-auto sm:px-3 sm:py-2 rounded-md text-lg sm:text-sm font-medium flex items-center justify-center"
            style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
            aria-label="Next month"
          >
            ›
          </button>
          <h2 className="text-base sm:text-xl ml-1 truncate" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--foreground)' }}>
            {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
          </h2>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:ml-auto">
          <select
            value={houseFilter}
            onChange={e => {
              setHouseFilter(e.target.value);
              setRoomFilter('');
            }}
            className="px-3 py-2 rounded-md text-sm outline-none w-full sm:w-auto"
            style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
          >
            <option value="">All properties</option>
            {houses.map(h => <option key={h.houseId} value={h.houseId}>{h.name}</option>)}
          </select>
          <select
            value={roomFilter}
            onChange={e => setRoomFilter(e.target.value)}
            className="px-3 py-2 rounded-md text-sm outline-none w-full sm:w-auto"
            style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
          >
            <option value="">All rooms</option>
            {roomsForFilter.map(r => {
              const houseName = !houseFilter ? houses.find(h => h.houseId === r.houseId)?.name : '';
              return (
                <option key={`${r.houseId}-${r.roomId}`} value={r.roomId}>
                  Room {r.roomNumber}{houseName ? ` · ${houseName}` : ''}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      <div className="flex gap-3 mb-3 text-xs flex-wrap">
        {Object.entries(STATUS_STYLE).filter(([k]) => k !== 'cancelled').map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5" style={{ color: 'var(--muted-foreground)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: v.dot, display: 'inline-block' }} />
            {k.replace('-', ' ')}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
        <div className="rounded-lg overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="grid grid-cols-7" style={{ borderBottom: '1px solid var(--border)' }}>
            {WEEKDAYS.map((d, i) => (
              <div
                key={d}
                className="px-0.5 sm:px-2 py-2 text-center text-[10px] sm:text-xs font-semibold uppercase tracking-wide"
                style={{ color: 'var(--muted-foreground)' }}
              >
                <span className="sm:hidden">{WEEKDAYS_SHORT[i]}</span>
                <span className="hidden sm:inline">{d}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {gridDays.map((day, idx) => {
              const dayBookings = bookingsOnDay(day.ymd, filteredBookings);
              const isSelected = selectedDay === day.ymd;
              return (
                <button
                  key={day.ymd}
                  onClick={() => setSelectedDay(day.ymd)}
                  className="min-h-[52px] sm:min-h-[80px] lg:min-h-[92px] p-1 sm:p-1.5 text-left align-top flex flex-col gap-0.5 sm:gap-1"
                  style={{
                    borderBottom: idx < 35 ? '1px solid var(--border)' : 'none',
                    borderRight: (idx % 7) !== 6 ? '1px solid var(--border)' : 'none',
                    background: isSelected ? 'var(--secondary)' : 'transparent',
                    opacity: day.inMonth ? 1 : 0.4,
                  }}
                >
                  <span
                    className="text-[11px] sm:text-xs font-medium self-end"
                    style={{
                      color: day.isToday ? 'var(--primary-foreground)' : isSelected ? 'var(--foreground)' : 'var(--muted-foreground)',
                      background: day.isToday ? 'var(--primary)' : 'transparent',
                      borderRadius: 999,
                      width: 22,
                      height: 22,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {day.date.getDate()}
                  </span>
                  {/* Mobile: count dots */}
                  <div className="flex flex-wrap gap-0.5 sm:hidden mt-auto">
                    {dayBookings.slice(0, 4).map(b => {
                      const sc = STATUS_STYLE[b.status] || STATUS_STYLE['confirmed'];
                      return (
                        <span
                          key={b.bookingId}
                          style={{ width: 5, height: 5, borderRadius: 999, background: sc.dot, display: 'inline-block' }}
                        />
                      );
                    })}
                    {dayBookings.length > 4 && (
                      <span className="text-[8px] leading-none" style={{ color: 'var(--muted-foreground)' }}>+</span>
                    )}
                  </div>
                  {/* Desktop: chips */}
                  <div className="hidden sm:flex flex-col gap-0.5 overflow-hidden">
                    {dayBookings.slice(0, 3).map(b => {
                      const sc = STATUS_STYLE[b.status] || STATUS_STYLE['confirmed'];
                      const cust = findCustomer(b.customerId);
                      const label = `${roomNo(b)} ${firstName(cust?.name)}`;
                      return (
                        <span
                          key={b.bookingId}
                          className="text-[10px] px-1.5 py-0.5 rounded truncate"
                          style={{ background: sc.bg, color: sc.text }}
                          title={label}
                        >
                          {label}
                        </span>
                      );
                    })}
                    {dayBookings.length > 3 && (
                      <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                        +{dayBookings.length - 3} more
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg p-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-3 gap-2">
            <h3 className="text-base sm:text-lg" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--foreground)' }}>
              {parseYmd(selectedDay).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
            </h3>
          </div>
          <div className="text-xs mb-3" style={{ color: 'var(--muted-foreground)' }}>
            {selectedBookings.length} booking{selectedBookings.length === 1 ? '' : 's'} on this day
          </div>
          <div className="space-y-2">
            {selectedBookings.map(b => {
              const sc = STATUS_STYLE[b.status] || STATUS_STYLE['confirmed'];
              const cust = findCustomer(b.customerId);
              const house = findHouse(b.houseId);
              const room = findRoom(b.houseId, b.roomId);
              const total = calcBookingTotal(b, []) + (purchaseTotalByBooking.get(b.bookingId) ?? 0);
              const roomLabel = roomNo(b);
              const roomType = room?.type || '';
              return (
                <button
                  key={b.bookingId}
                  onClick={() => onNavigate('booking-detail', { bookingId: b.bookingId })}
                  className="w-full text-left p-3 rounded-md transition-colors hover:bg-[var(--secondary)]"
                  style={{ border: '1px solid var(--border)' }}
                >
                  <div className="flex items-start justify-between mb-1 gap-2">
                    <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                      {roomLabel} - {firstName(cust?.name)}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded font-medium flex-shrink-0" style={{ background: sc.bg, color: sc.text }}>
                      {b.status.replace('-', ' ')}
                    </span>
                  </div>
                  <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    {house?.name ?? 'Property'}{roomType ? ` · ${roomType}` : ''}
                  </div>
                  {cust?.phone && (
                    <div className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                      {cust.phone}
                    </div>
                  )}
                  <div className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                    {formatDate(b.checkIn)} → {formatDate(b.checkOut)}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-medium" style={{ color: 'var(--foreground)', fontFamily: 'DM Mono, monospace' }}>
                      {formatCurrency(total)}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>View stay →</span>
                  </div>
                </button>
              );
            })}
            {selectedBookings.length === 0 && (
              <div className="text-sm py-6 text-center" style={{ color: 'var(--muted-foreground)' }}>
                No bookings on this day.
                <div className="mt-3">
                  <button
                    onClick={() => onNavigate('booking-new', { checkIn: selectedDay })}
                    className="text-xs px-3 py-1.5 rounded font-semibold"
                    style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                  >
                    + New booking
                  </button>
                </div>
              </div>
            )}
          </div>
          {selectedBookings.length > 0 && (
            <button
              onClick={() => onNavigate('booking-new', { checkIn: selectedDay })}
              className="w-full mt-3 py-2 rounded-md text-xs font-semibold"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              + New booking on this day
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
