import type { User, House, Booking, Customer, Purchase, CatalogueItem, Company, Room } from '../data/types';
import { formatCurrency } from '../data/types';
import {
  useAccessibleBookings,
  useAccessibleCatalogue,
  useAccessibleHouses,
  useAccessibleRooms,
  useCollection,
} from '../lib/firebase/hooks';
import type { Page } from '../components/Layout';
import PortalActions from '../components/PortalActions';
import {
  isSuperAdmin,
  isStaff,
  normalizeRole,
  roleDisplayLabel,
} from '@/lib/permissions';
import DataError from '@/components/DataError';

interface Props {
  currentUser: User;
  onNavigate: (page: Page, params?: Record<string, string>) => void;
}

export default function Dashboard({ currentUser, onNavigate }: Props) {
  if (isSuperAdmin(currentUser)) {
    return <SuperAdminDashboard currentUser={currentUser} onNavigate={onNavigate} />;
  }
  if (isStaff(currentUser)) {
    return <MaintenanceDashboard currentUser={currentUser} onNavigate={onNavigate} />;
  }
  return <OwnerDashboard currentUser={currentUser} onNavigate={onNavigate} />;
}

function greeting(name: string) {
  const h = new Date().getHours();
  const part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  return `Good ${part}, ${name.split(' ')[0]}.`;
}

function dateLabel() {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Super Admin — org control only (no occupancy ops). */
function SuperAdminDashboard({ currentUser, onNavigate }: Props) {
  const { data: houses, loading: housesLoading, error: housesError } = useCollection<House>('houses');
  const { data: users, loading: usersLoading, error: usersError } = useCollection<User>('users');
  const { data: companies, loading: companiesLoading } = useCollection<Company>('companies');

  const loading = housesLoading || usersLoading || companiesLoading;
  const loadError = housesError || usersError;

  const owners = users.filter(u => normalizeRole(u.role) === 'admin');
  const maintenance = users.filter(u => normalizeRole(u.role) === 'staff');

  if (loading) {
    return <div className="p-8 text-center" style={{ color: 'var(--muted-foreground)' }}>Loading dashboard…</div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <DataError message={loadError} onRetry={() => window.location.reload()} />
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="min-w-0">
          <h1 className="text-3xl mb-1" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--foreground)' }}>
            {greeting(currentUser.name)}
          </h1>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            {dateLabel()} · Super Admin · organization overview
          </p>
        </div>
        <PortalActions />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Companies" value={String(companies.length)} sub="Owner organizations" accent />
        <StatCard label="Properties" value={String(houses.length)} sub="Homes / stays listed" />
        <StatCard label="Property Owners" value={String(owners.length)} sub="Admin accounts" />
        <StatCard label="Maintenance" value={String(maintenance.length)} sub="Staff accounts" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>Property Owners</h2>
            <button className="text-sm font-medium" style={{ color: 'var(--primary)' }} onClick={() => onNavigate('staff')}>
              Manage team →
            </button>
          </div>
          {owners.length === 0 ? (
            <div className="px-5 py-8 text-sm text-center" style={{ color: 'var(--muted-foreground)' }}>
              No property owners yet.
            </div>
          ) : (
            owners.slice(0, 6).map((u, i) => (
              <div
                key={u.uid}
                className="px-5 py-3"
                style={{ borderBottom: i < Math.min(owners.length, 6) - 1 ? '1px solid var(--border)' : 'none' }}
              >
                <div className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{u.name}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{u.email}</div>
              </div>
            ))
          )}
        </div>

        <div className="rounded-lg overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>Companies</h2>
            <button className="text-sm font-medium" style={{ color: 'var(--primary)' }} onClick={() => onNavigate('companies')}>
              Manage →
            </button>
          </div>
          {companies.length === 0 ? (
            <div className="px-5 py-8 text-sm text-center" style={{ color: 'var(--muted-foreground)' }}>
              No companies yet.{' '}
              <button type="button" className="underline" style={{ color: 'var(--accent)' }} onClick={() => onNavigate('companies')}>
                Add one
              </button>
            </div>
          ) : (
            companies.slice(0, 6).map((c, i) => {
              const propCount = houses.filter(h => h.companyId === c.companyId).length;
              return (
                <div
                  key={c.companyId}
                  className="px-5 py-3 flex items-center justify-between gap-2"
                  style={{ borderBottom: i < Math.min(companies.length, 6) - 1 ? '1px solid var(--border)' : 'none' }}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>{c.name}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                      {propCount} propert{propCount === 1 ? 'y' : 'ies'}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/** Property Owner (admin) — stays, guests, revenue, guest purchases. */
function OwnerDashboard({ currentUser, onNavigate }: Props) {
  const { data: HOUSES, loading: housesLoading, error: housesError } = useAccessibleHouses<House>(currentUser);
  const { data: BOOKINGS, loading: bookingsLoading, error: bookingsError } = useAccessibleBookings(currentUser);
  const { data: CUSTOMERS } = useCollection<Customer>('customers');
  const { data: rooms, loading: roomsLoading } = useAccessibleRooms(currentUser);
  const { data: PURCHASES, loading: purchasesLoading } = useCollection<Purchase>('purchases');
  const { data: CATALOGUE } = useAccessibleCatalogue(currentUser);

  const loading = housesLoading || bookingsLoading || roomsLoading || purchasesLoading;
  const loadError = housesError || bookingsError;

  const houseIds = new Set(HOUSES.map(h => h.houseId));
  const vacantCount = rooms.filter(r => r.currentStatus === 'vacant').length;
  const occupiedCount = rooms.filter(r => r.currentStatus === 'occupied').length;
  const maintenanceCount = rooms.filter(r => r.currentStatus === 'maintenance').length;
  const occupancyPct = rooms.length ? Math.round((occupiedCount / rooms.length) * 100) : 0;

  const scopedBookings = BOOKINGS;
  const bookingById = new Map(scopedBookings.map(b => [b.bookingId, b]));
  const activeBookings = scopedBookings.filter(b => b.status === 'checked-in' || b.status === 'confirmed');
  const today = new Date().toISOString().split('T')[0];
  const todayRevenue = scopedBookings.filter(b => b.status === 'checked-in').reduce((sum, b) => sum + b.rent, 0);
  const checkoutsToday = scopedBookings.filter(b => b.checkOut === today);
  const recentBookings = [...scopedBookings].sort((a, b) => b.bookingId.localeCompare(a.bookingId)).slice(0, 5);

  const scopedPurchases = PURCHASES
    .filter(p => {
      const booking = bookingById.get(p.bookingId);
      return booking && houseIds.has(booking.houseId);
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const guestSpend = scopedPurchases.reduce((s, p) => s + p.price * p.quantity, 0);
  const recentPurchases = scopedPurchases.slice(0, 8);

  if (loading) {
    return <div className="p-8 text-center" style={{ color: 'var(--muted-foreground)' }}>Loading dashboard…</div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <DataError message={loadError} onRetry={() => window.location.reload()} />
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="min-w-0">
          <h1 className="text-3xl mb-1" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--foreground)' }}>
            {greeting(currentUser.name)}
          </h1>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            {dateLabel()} · {roleDisplayLabel(currentUser.role)} · {HOUSES.length} {HOUSES.length === 1 ? 'property' : 'properties'}
          </p>
        </div>
        <PortalActions />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Occupancy" value={`${occupancyPct}%`} sub={`${occupiedCount} of ${rooms.length} rooms`} accent />
        <StatCard label="Revenue Today" value={formatCurrency(todayRevenue)} sub="Active stays (room rate)" />
        <StatCard label="Active Bookings" value={String(activeBookings.length)} sub={`${checkoutsToday.length} checking out today`} />
        <StatCard label="Guest purchases" value={formatCurrency(guestSpend)} sub={`${scopedPurchases.length} items billed`} />
      </div>

      <div className="rounded-lg p-5 mb-6" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--foreground)' }}>Property Occupancy</h2>
        <div className="space-y-3">
          {HOUSES.map(house => {
            const houseRooms = rooms.filter(r => r.houseId === house.houseId);
            const occ = houseRooms.filter(r => r.currentStatus === 'occupied').length;
            const pct = houseRooms.length ? Math.round((occ / houseRooms.length) * 100) : 0;
            return (
              <div key={house.houseId}>
                <div className="flex items-center justify-between mb-1.5">
                  <button
                    className="text-sm font-medium hover:underline text-left"
                    style={{ color: 'var(--foreground)' }}
                    onClick={() => onNavigate('house-detail', { houseId: house.houseId })}
                  >
                    {house.name}
                  </button>
                  <span className="text-xs" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace' }}>
                    {occ}/{houseRooms.length} rooms · {pct}%
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--muted)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: pct > 80 ? 'var(--status-occupied)' : 'var(--primary)' }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatusSummaryCard label="Vacant" count={vacantCount} color="var(--status-vacant)" bg="var(--status-vacant-bg)" />
        <StatusSummaryCard label="Occupied" count={occupiedCount} color="var(--status-occupied)" bg="var(--status-occupied-bg)" />
        <StatusSummaryCard label="Maintenance" count={maintenanceCount} color="var(--status-maintenance)" bg="var(--status-maintenance-bg)" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="rounded-lg overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>Recent Bookings</h2>
            <button className="text-sm font-medium" style={{ color: 'var(--primary)' }} onClick={() => onNavigate('bookings')}>
              View all →
            </button>
          </div>
          <div>
            {recentBookings.length === 0 && (
              <div className="px-5 py-8 text-sm text-center" style={{ color: 'var(--muted-foreground)' }}>
                No bookings yet.{' '}
                <button type="button" className="underline" style={{ color: 'var(--accent)' }} onClick={() => onNavigate('booking-new')}>
                  Create one
                </button>
              </div>
            )}
            {recentBookings.map((booking, i) => {
              const house = HOUSES.find(h => h.houseId === booking.houseId);
              const room = rooms.find(r => r.roomId === booking.roomId);
              const customer = CUSTOMERS.find(c => c.customerId === booking.customerId);
              const statusColors: Record<string, { bg: string; text: string }> = {
                confirmed: { bg: '#EDF4FF', text: '#1A56B0' },
                'checked-in': { bg: 'var(--status-vacant-bg)', text: 'var(--status-vacant)' },
                'checked-out': { bg: 'var(--secondary)', text: 'var(--muted-foreground)' },
                cancelled: { bg: 'var(--status-occupied-bg)', text: 'var(--status-occupied)' },
              };
              const sc = statusColors[booking.status] || statusColors.confirmed;
              return (
                <button
                  key={booking.bookingId}
                  onClick={() => onNavigate('booking-detail', { bookingId: booking.bookingId })}
                  className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-[var(--secondary)] transition-colors"
                  style={{ borderBottom: i < recentBookings.length - 1 ? '1px solid var(--border)' : 'none' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>{customer?.name ?? '—'}</div>
                    <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted-foreground)' }}>
                      {house?.name} · Room {room?.roomNumber}
                    </div>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded font-medium flex-shrink-0" style={{ background: sc.bg, color: sc.text }}>
                    {booking.status.replace('-', ' ')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <h2 className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>Guest purchases</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                Items guests bought during stay · {formatCurrency(guestSpend)}
              </p>
            </div>
            <button className="text-sm font-medium" style={{ color: 'var(--primary)' }} onClick={() => onNavigate('purchases')}>
              Add →
            </button>
          </div>
          <div>
            {recentPurchases.length === 0 && (
              <div className="px-5 py-8 text-sm text-center" style={{ color: 'var(--muted-foreground)' }}>
                No guest purchases yet.{' '}
                <button type="button" className="underline" style={{ color: 'var(--accent)' }} onClick={() => onNavigate('purchases')}>
                  Add one on a stay
                </button>
              </div>
            )}
            {recentPurchases.map((purchase, i) => {
              const booking = bookingById.get(purchase.bookingId);
              const customer = booking ? CUSTOMERS.find(c => c.customerId === booking.customerId) : undefined;
              const item = CATALOGUE.find(c => c.itemId === purchase.itemId);
              const amount = purchase.price * purchase.quantity;
              return (
                <button
                  key={purchase.purchaseId}
                  type="button"
                  onClick={() => onNavigate('booking-detail', { bookingId: purchase.bookingId })}
                  className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-[var(--secondary)] transition-colors"
                  style={{ borderBottom: i < recentPurchases.length - 1 ? '1px solid var(--border)' : 'none' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>
                      {item?.name ?? purchase.itemId}
                    </div>
                    <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted-foreground)' }}>
                      {customer?.name ?? 'Guest'} · qty {purchase.quantity}
                    </div>
                  </div>
                  <div className="text-sm font-medium flex-shrink-0" style={{ color: 'var(--foreground)', fontFamily: 'DM Mono, monospace' }}>
                    {formatCurrency(amount)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Maintenance staff — rooms needing attention, not revenue/occupancy ops. */
function MaintenanceDashboard({ currentUser, onNavigate }: Props) {
  const { data: HOUSES, loading: housesLoading, error: housesError } = useAccessibleHouses<House>(currentUser);
  const { data: rooms, loading: roomsLoading } = useAccessibleRooms(currentUser);

  const maintenanceRooms = rooms.filter(r => r.currentStatus === 'maintenance');
  const vacantCount = rooms.filter(r => r.currentStatus === 'vacant').length;
  const occupiedCount = rooms.filter(r => r.currentStatus === 'occupied').length;

  const loading = housesLoading || roomsLoading;

  if (loading) {
    return <div className="p-8 text-center" style={{ color: 'var(--muted-foreground)' }}>Loading dashboard…</div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <DataError message={housesError} onRetry={() => window.location.reload()} />
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="min-w-0">
          <h1 className="text-3xl mb-1" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--foreground)' }}>
            {greeting(currentUser.name)}
          </h1>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            {dateLabel()} · Maintenance · {HOUSES[0]?.name ?? 'Assigned property'}
          </p>
        </div>
        <PortalActions />
      </div>

      <div className="grid grid-cols-3 gap-3 mb-8">
        <StatusSummaryCard label="Needs work" count={maintenanceRooms.length} color="var(--status-maintenance)" bg="var(--status-maintenance-bg)" />
        <StatusSummaryCard label="Vacant" count={vacantCount} color="var(--status-vacant)" bg="var(--status-vacant-bg)" />
        <StatusSummaryCard label="Occupied" count={occupiedCount} color="var(--status-occupied)" bg="var(--status-occupied-bg)" />
      </div>

      <div className="rounded-lg overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>Maintenance queue</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
            Rooms marked for maintenance at your property
          </p>
        </div>
        {maintenanceRooms.length === 0 ? (
          <div className="px-5 py-10 text-sm text-center" style={{ color: 'var(--muted-foreground)' }}>
            No rooms in maintenance. Open a property to update room status.
          </div>
        ) : (
          maintenanceRooms.map((room: Room, i) => {
            const house = HOUSES.find(h => h.houseId === room.houseId);
            return (
              <button
                key={room.roomId}
                type="button"
                onClick={() => onNavigate('room-detail', { houseId: room.houseId, roomId: room.roomId })}
                className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-[var(--secondary)] transition-colors"
                style={{ borderBottom: i < maintenanceRooms.length - 1 ? '1px solid var(--border)' : 'none' }}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                    Room {room.roomNumber}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                    {house?.name} · Floor {room.floor} · {room.type}
                  </div>
                </div>
                <span className="text-xs font-medium" style={{ color: 'var(--status-maintenance)' }}>
                  Open →
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: accent ? 'var(--primary)' : 'var(--card)',
        border: accent ? 'none' : '1px solid var(--border)',
      }}
    >
      <div
        className="text-xs font-medium mb-1"
        style={{
          color: accent ? 'rgba(247,243,238,0.7)' : 'var(--muted-foreground)',
          fontFamily: 'DM Mono, monospace',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </div>
      <div
        className="text-2xl font-semibold mb-0.5"
        style={{ fontFamily: 'DM Serif Display, serif', color: accent ? 'var(--primary-foreground)' : 'var(--foreground)' }}
      >
        {value}
      </div>
      <div className="text-xs" style={{ color: accent ? 'rgba(247,243,238,0.6)' : 'var(--muted-foreground)' }}>
        {sub}
      </div>
    </div>
  );
}

function StatusSummaryCard({ label, count, color, bg }: { label: string; count: number; color: string; bg: string }) {
  return (
    <div className="rounded-lg p-4 flex flex-col gap-1" style={{ background: bg }}>
      <div className="text-2xl font-semibold" style={{ fontFamily: 'DM Serif Display, serif', color }}>
        {count}
      </div>
      <div className="text-xs font-medium" style={{ color }}>
        {label}
      </div>
    </div>
  );
}
