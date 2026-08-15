import type { User, Customer, Booking, House, Purchase } from '../data/types';
import { formatCurrency, calcBookingTotal, formatDate, calcNights } from '../data/types';
import { useCollection, useAllRooms } from '../lib/firebase/hooks';
import type { Page } from '../components/Layout';

interface Props {
  currentUser: User;
  customerId: string;
  onNavigate: (page: Page, params?: Record<string, string>) => void;
}

export default function CustomerDetail({ customerId, onNavigate }: Props) {
  const { data: CUSTOMERS, loading } = useCollection<Customer>('customers');
  const { data: BOOKINGS } = useCollection<Booking>('bookings');
  const { data: HOUSES } = useCollection<House>('houses');
  const { data: allRooms } = useAllRooms();
  const { data: allPurchases } = useCollection<Purchase>('purchases');

  const customer = CUSTOMERS.find(c => c.customerId === customerId);
  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--muted-foreground)' }}>Loading…</div>;
  if (!customer) return <div className="p-8" style={{ color: 'var(--muted-foreground)' }}>Guest not found.</div>;

  const bookings = BOOKINGS.filter(b => b.customerId === customerId);
  const totalSpend = bookings
    .filter(b => b.status === 'checked-out')
    .reduce((s, b) => s + calcBookingTotal(b, allPurchases.filter(p => p.bookingId === b.bookingId)), 0);

  const whatsappUrl = `https://wa.me/${customer.phone.replace(/[^0-9]/g, '')}`;

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <button className="text-sm mb-5 flex items-center gap-1" style={{ color: 'var(--muted-foreground)' }} onClick={() => onNavigate('customers')}>
        ← Guests
      </button>

      <div className="flex items-start gap-5 mb-6">
        <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-semibold flex-shrink-0" style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
          {customer.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
        </div>
        <div className="flex-1">
          <h1 className="text-3xl mb-1" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--foreground)' }}>{customer.name}</h1>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{customer.phone} · {customer.email}</p>
          <div className="flex gap-2 mt-3">
            <a href={`tel:${customer.phone}`} className="px-3 py-1.5 rounded text-xs font-medium" style={{ background: 'var(--secondary)', color: 'var(--secondary-foreground)' }}>Call</a>
            <a href={whatsappUrl} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded text-xs font-medium" style={{ background: '#25D366', color: 'white' }}>WhatsApp</a>
          </div>
        </div>
      </div>

      {/* Info grid */}
      <div className="rounded-lg p-5 mb-5 grid grid-cols-3 gap-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <div>
          <div className="text-xs mb-1" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' }}>Total Stays</div>
          <div className="text-2xl font-semibold" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--foreground)' }}>{bookings.length}</div>
        </div>
        <div>
          <div className="text-xs mb-1" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' }}>Lifetime Spend</div>
          <div className="text-2xl font-semibold" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--foreground)' }}>{formatCurrency(totalSpend)}</div>
        </div>
        <div>
          <div className="text-xs mb-1" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' }}>ID Proof</div>
          <div className="text-sm" style={{ color: 'var(--foreground)' }}>{customer.idProof}</div>
        </div>
      </div>

      {/* Booking history */}
      <div className="rounded-lg overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Booking History</h2>
        </div>
        {bookings.length === 0 && (
          <div className="px-5 py-10 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>No bookings yet.</div>
        )}
        {bookings.map((b, i) => {
          const house = HOUSES.find(h => h.houseId === b.houseId);
          const room = allRooms.find(r => r.roomId === b.roomId && r.houseId === b.houseId);
          const total = calcBookingTotal(b, allPurchases.filter(p => p.bookingId === b.bookingId));
          const nights = calcNights(b.checkIn, b.checkOut);
          const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
            'confirmed': { bg: '#EDF4FF', text: '#1A56B0' },
            'checked-in': { bg: 'var(--status-vacant-bg)', text: 'var(--status-vacant)' },
            'checked-out': { bg: 'var(--secondary)', text: 'var(--muted-foreground)' },
          };
          const sc = STATUS_STYLE[b.status] || STATUS_STYLE['confirmed'];

          return (
            <button
              key={b.bookingId}
              onClick={() => onNavigate('booking-detail', { bookingId: b.bookingId })}
              className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-[var(--secondary)] transition-colors"
              style={{ borderBottom: i < bookings.length - 1 ? '1px solid var(--border)' : 'none' }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{house?.name} · Room {room?.roomNumber}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace' }}>
                  {formatDate(b.checkIn)} → {formatDate(b.checkOut)} · {nights} nights
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-sm font-medium text-right" style={{ color: 'var(--foreground)', fontFamily: 'DM Mono, monospace' }}>{formatCurrency(total)}</div>
                <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: sc.bg, color: sc.text }}>{b.status.replace('-', ' ')}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
