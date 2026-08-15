import { useState, useMemo } from 'react';
import type { User, Customer, Booking, House } from '../data/types';
import { useAccessibleBookings, useAccessibleHouses, useCollection } from '../lib/firebase/hooks';
import { db } from '../lib/firebase/config';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import type { Page } from '../components/Layout';
import { createId } from '@/lib/ids';
import { useToast } from '@/components/ToastProvider';
import { canViewAllHouses, isSuperAdmin } from '@/lib/permissions';

interface Props {
  currentUser: User;
  onNavigate: (page: Page, params?: Record<string, string>) => void;
}

const emptyGuest = { name: '', phone: '', email: '', idProof: '' };

export default function Customers({ currentUser, onNavigate }: Props) {
  const toast = useToast();
  const { data: CUSTOMERS, loading } = useCollection<Customer>('customers');
  const { data: BOOKINGS } = useAccessibleBookings(currentUser);
  const { data: HOUSES } = useAccessibleHouses<House>(currentUser);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyGuest);
  const [saving, setSaving] = useState(false);

  // Only guests with stays at accessible properties (superadmin sees all)
  const scopedCustomers = useMemo(() => {
    if (isSuperAdmin(currentUser) || canViewAllHouses(currentUser)) return CUSTOMERS;
    const allowed = new Set(BOOKINGS.map(b => b.customerId));
    return CUSTOMERS.filter(c => allowed.has(c.customerId));
  }, [CUSTOMERS, BOOKINGS, currentUser]);

  const filtered = search
    ? scopedCustomers.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase())
        || c.phone.includes(search)
        || c.email.toLowerCase().includes(search.toLowerCase())
      )
    : scopedCustomers;

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyGuest);
    setShowForm(true);
  };

  const openEdit = (c: Customer, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(c.customerId);
    setForm({ name: c.name, phone: c.phone, email: c.email, idProof: c.idProof });
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error('Name and phone are required.');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, 'customers', editingId), {
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          idProof: form.idProof.trim(),
        });
        toast.success('Guest updated.');
      } else {
        const customerId = createId('c');
        await setDoc(doc(db, 'customers', customerId), {
          customerId,
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          idProof: form.idProof.trim(),
          bookingHistory: [],
        });
        toast.success('Guest added.');
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyGuest);
    } catch (err) {
      console.error(err);
      toast.error('Could not save guest.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--muted-foreground)' }}>Loading guests…</div>;

  const inputStyle = { background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' } as const;

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="flex items-end justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl mb-1" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--foreground)' }}>Guests</h1>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{filtered.length} guest{filtered.length !== 1 ? 's' : ''} at your properties</p>
        </div>
        <button
          type="button"
          onClick={() => showForm ? setShowForm(false) : openCreate()}
          className="px-4 py-2 rounded-md text-sm font-semibold"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
        >
          {showForm ? 'Close' : '+ Add Guest'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="mb-6 p-5 rounded-xl space-y-3" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
            {editingId ? 'Edit Guest' : 'New Guest'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input required placeholder="Full name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="px-3 py-2 rounded text-sm outline-none" style={inputStyle} />
            <input required placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="px-3 py-2 rounded text-sm outline-none" style={inputStyle} />
            <input type="email" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="px-3 py-2 rounded text-sm outline-none" style={inputStyle} />
            <input placeholder="ID proof (passport / Aadhaar ref)" value={form.idProof} onChange={e => setForm({ ...form, idProof: e.target.value })} className="px-3 py-2 rounded text-sm outline-none" style={inputStyle} />
          </div>
          <button type="submit" disabled={saving} className="px-4 py-2 rounded text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--accent)', color: 'white' }}>
            {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Guest'}
          </button>
        </form>
      )}

      <input
        type="text"
        placeholder="Search by name, phone, or email…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full px-3 py-2.5 rounded-md text-sm outline-none mb-5"
        style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
      />

      <div className="rounded-lg overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        {filtered.map((customer, i) => {
          const stays = BOOKINGS.filter(b => b.customerId === customer.customerId && b.status !== 'cancelled');
          const totalBookings = stays.length;
          const activeBooking = BOOKINGS.find(b => b.customerId === customer.customerId && (b.status === 'checked-in' || b.status === 'confirmed'));
          const activeHouse = activeBooking ? HOUSES.find(h => h.houseId === activeBooking.houseId) : null;

          return (
            <div
              key={customer.customerId}
              className="flex items-center gap-4 px-5 py-4"
              style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none' }}
            >
              <button
                type="button"
                onClick={() => onNavigate('customer-detail', { customerId: customer.customerId })}
                className="flex flex-1 items-center gap-4 text-left min-w-0"
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0" style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                  {customer.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{customer.name}</span>
                    {activeBooking && (
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--status-vacant-bg)', color: 'var(--status-vacant)' }}>
                        Currently staying
                      </span>
                    )}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                    {customer.phone}{customer.email ? ` · ${customer.email}` : ''}
                  </div>
                  {activeBooking && activeHouse && (
                    <div className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{activeHouse.name}</div>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-sm font-medium" style={{ color: 'var(--foreground)', fontFamily: 'DM Mono, monospace' }}>{totalBookings}</div>
                  <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>stay{totalBookings !== 1 ? 's' : ''}</div>
                </div>
              </button>
              <button
                type="button"
                onClick={(e) => openEdit(customer, e)}
                className="text-xs px-3 py-1.5 rounded font-semibold flex-shrink-0"
                style={{ background: 'var(--secondary)', color: 'var(--foreground)' }}
              >
                Edit
              </button>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-5 py-12 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>No guests found.</div>
        )}
      </div>
    </div>
  );
}
