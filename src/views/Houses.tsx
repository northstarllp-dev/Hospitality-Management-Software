import { useState } from 'react';
import type { User, House, Room, Company } from '../data/types';
import { useCollection, useAllRooms } from '../lib/firebase/hooks';
import { db } from '../lib/firebase/config';
import { doc, setDoc, writeBatch } from 'firebase/firestore';
import type { Page } from '../components/Layout';
import { canManageProperties, filterHousesByAccess } from '@/lib/permissions';
import { catalogueForHouse } from '@/data/mock';
import { useToast } from '@/components/ToastProvider';
import { createId } from '@/lib/ids';

interface Props {
  currentUser: User;
  onNavigate: (page: Page, params?: Record<string, string>) => void;
}

const DEFAULT_COVER =
  'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&q=80&w=800';

export default function Houses({ currentUser, onNavigate }: Props) {
  const toast = useToast();
  const { data: allHouses, loading } = useCollection<House>('houses');
  const { data: allRooms } = useAllRooms();
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newHouse, setNewHouse] = useState({
    name: '',
    address: '',
    description: '',
    coverImage: '',
    roomCount: 4,
    companyId: '',
  });

  const { data: companies } = useCollection<Company>('companies');
  const accessibleHouses = filterHousesByAccess(currentUser, allHouses);

  const handleAddHouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHouse.name || !newHouse.address) return;
    setSaving(true);
    try {
      const houseId = createId('h');
      const roomCount = Math.max(0, Math.min(50, Number(newHouse.roomCount) || 0));
      const coverImage = newHouse.coverImage || DEFAULT_COVER;

      await setDoc(doc(db, 'houses', houseId), {
        houseId,
        name: newHouse.name.trim(),
        address: newHouse.address.trim(),
        description: newHouse.description.trim(),
        coverImage,
        roomCount,
        companyId: newHouse.companyId || null,
      });

      if (roomCount > 0) {
        const batch = writeBatch(db);
        for (let i = 1; i <= roomCount; i++) {
          const roomId = createId('r');
          const floor = Math.ceil(i / 4);
          const roomNumber = String(floor * 100 + ((i - 1) % 4) + 1);
          batch.set(doc(db, 'houses', houseId, 'rooms', roomId), {
            roomId,
            houseId,
            roomNumber,
            type: 'Double',
            rent: 4000,
            maxOccupancy: 2,
            extraBeds: 0,
            costPerBed: 0,
            currentStatus: 'vacant',
            floor,
          });
        }
        await batch.commit();
      }

      // Seed a default per-property catalogue (can be edited or duplicated later)
      const catBatch = writeBatch(db);
      for (const item of catalogueForHouse(houseId)) {
        catBatch.set(doc(db, 'catalogue', item.itemId), item);
      }
      await catBatch.commit();

      setShowAdd(false);
      setNewHouse({ name: '', address: '', description: '', coverImage: '', roomCount: 4, companyId: '' });
      toast.success('Property created.');
      onNavigate('house-detail', { houseId });
    } catch (err) {
      console.error(err);
      toast.error('Could not create property.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--muted-foreground)' }}>Loading properties…</div>;

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-end justify-between mb-8 gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl mb-1" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--foreground)' }}>Properties</h1>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{accessibleHouses.length} {accessibleHouses.length === 1 ? 'property' : 'properties'}</p>
        </div>
        {canManageProperties(currentUser) && (
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="px-4 py-2 rounded-md text-sm font-semibold transition-colors"
            style={{ background: showAdd ? 'var(--secondary)' : 'var(--primary)', color: showAdd ? 'var(--foreground)' : 'var(--primary-foreground)' }}
          >
            {showAdd ? 'Cancel' : '+ Add Property'}
          </button>
        )}
      </div>

      {showAdd && canManageProperties(currentUser) && (
        <form onSubmit={handleAddHouse} className="mb-8 p-6 rounded-xl space-y-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>Create New Property</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Name</label>
              <input required value={newHouse.name} onChange={e => setNewHouse({ ...newHouse, name: e.target.value })} className="w-full px-3 py-2 rounded text-sm outline-none" style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }} placeholder="e.g. Oceanview Villa" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Address</label>
              <input required value={newHouse.address} onChange={e => setNewHouse({ ...newHouse, address: e.target.value })} className="w-full px-3 py-2 rounded text-sm outline-none" style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }} placeholder="123 Beach Rd, Kochi" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Description</label>
              <textarea value={newHouse.description} onChange={e => setNewHouse({ ...newHouse, description: e.target.value })} className="w-full px-3 py-2 rounded text-sm outline-none" rows={2} style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }} placeholder="Brief description of the property..." />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Number of rooms</label>
              <input
                type="number"
                min={0}
                max={50}
                required
                value={newHouse.roomCount}
                onChange={e => setNewHouse({ ...newHouse, roomCount: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded text-sm outline-none"
                style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>Creates vacant rooms you can configure later.</p>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Company</label>
              <select
                value={newHouse.companyId}
                onChange={e => setNewHouse({ ...newHouse, companyId: e.target.value })}
                className="w-full px-3 py-2 rounded text-sm outline-none"
                style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              >
                <option value="">Unassigned</option>
                {companies.map(c => (
                  <option key={c.companyId} value={c.companyId}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Cover photo URL</label>
              <input type="url" value={newHouse.coverImage} onChange={e => setNewHouse({ ...newHouse, coverImage: e.target.value })} className="w-full px-3 py-2 rounded text-sm outline-none" style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }} placeholder="https://..." />
            </div>
          </div>
          {newHouse.coverImage && (
            <div className="h-32 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <img src={newHouse.coverImage} alt="Cover preview" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex justify-end pt-2">
            <button type="submit" disabled={saving} className="px-5 py-2 rounded text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
              {saving ? 'Creating...' : 'Create Property'}
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {accessibleHouses.map(house => {
          const rooms = allRooms.filter((r: Room) => r.houseId === house.houseId);
          const vacant = rooms.filter(r => r.currentStatus === 'vacant').length;
          const occupied = rooms.filter(r => r.currentStatus === 'occupied').length;
          const maintenance = rooms.filter(r => r.currentStatus === 'maintenance').length;
          const total = rooms.length || house.roomCount || 0;
          const pct = total ? Math.round((occupied / total) * 100) : 0;

          return (
            <button
              key={house.houseId}
              onClick={() => onNavigate('house-detail', { houseId: house.houseId })}
              className="rounded-xl overflow-hidden text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <div className="relative h-40 overflow-hidden">
                <img src={house.coverImage} alt={house.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(28,22,18,0.6) 0%, transparent 60%)' }} />
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <h2 className="text-white text-xl font-semibold leading-tight" style={{ fontFamily: 'DM Serif Display, serif' }}>{house.name}</h2>
                  <p className="text-white/70 text-xs mt-0.5">{house.address.split(',').slice(-2).join(',').trim()}</p>
                </div>
              </div>
              <div className="p-4">
                <p className="text-sm mb-4 line-clamp-2" style={{ color: 'var(--muted-foreground)' }}>{house.description}</p>
                <div className="flex items-center gap-3 mb-3">
                  <StatusPill label="Vacant" count={vacant} color="var(--status-vacant)" bg="var(--status-vacant-bg)" />
                  <StatusPill label="Occupied" count={occupied} color="var(--status-occupied)" bg="var(--status-occupied-bg)" />
                  {maintenance > 0 && <StatusPill label="Maint." count={maintenance} color="var(--status-maintenance)" bg="var(--status-maintenance-bg)" />}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--muted)' }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--primary)' }} />
                  </div>
                  <span className="text-xs" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace' }}>{pct}%</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatusPill({ label, count, color, bg }: { label: string; count: number; color: string; bg: string }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: bg, color }}>
      {count} {label}
    </span>
  );
}
