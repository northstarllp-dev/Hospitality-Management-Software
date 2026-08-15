import { useEffect, useMemo, useState } from 'react';
import type { User, Room, House, RoomStatus } from '../data/types';
import { formatCurrency } from '../data/types';
import { useCollection, useHouseRooms, upsertRoom } from '../lib/firebase/hooks';
import { db } from '../lib/firebase/config';
import { doc, setDoc, updateDoc, deleteDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import type { Page } from '../components/Layout';
import { canEditProperty, canEditRooms, canManageProperties } from '@/lib/permissions';
import { useToast } from '@/components/ToastProvider';
import { createId } from '@/lib/ids';
import { fetchRoomBookings } from '@/lib/bookingService';

interface Props {
  currentUser: User;
  houseId: string;
  onNavigate: (page: Page, params?: Record<string, string>) => void;
}

const STATUS_STYLE: Record<RoomStatus, { bg: string; text: string; label: string }> = {
  vacant: { bg: 'var(--status-vacant-bg)', text: 'var(--status-vacant)', label: 'Vacant' },
  occupied: { bg: 'var(--status-occupied-bg)', text: 'var(--status-occupied)', label: 'Occupied' },
  maintenance: { bg: 'var(--status-maintenance-bg)', text: 'var(--status-maintenance)', label: 'Maintenance' },
};

type RoomEditForm = {
  roomNumber: string;
  type: Room['type'];
  rent: number;
  maxOccupancy: number;
  extraBeds: number;
  costPerBed: number;
  floor: number;
  currentStatus: RoomStatus;
};

function roomDefaults(room: Room): RoomEditForm {
  return {
    roomNumber: room.roomNumber,
    type: room.type,
    rent: room.rent,
    maxOccupancy: room.maxOccupancy,
    extraBeds: room.extraBeds ?? 0,
    costPerBed: room.costPerBed ?? 0,
    floor: room.floor,
    currentStatus: room.currentStatus,
  };
}

function nextDay(ymd: string) {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

export default function HouseDetail({ currentUser, houseId, onNavigate }: Props) {
  const toast = useToast();
  const { data: houses, loading: housesLoading } = useCollection<House>('houses');
  const { data: rooms, loading: roomsLoading } = useHouseRooms(houseId);

  const [deleting, setDeleting] = useState(false);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [savingRoom, setSavingRoom] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | RoomStatus>('all');
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [roomEdit, setRoomEdit] = useState<RoomEditForm | null>(null);
  const [savingRoomEdit, setSavingRoomEdit] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const [newRoom, setNewRoom] = useState({
    roomNumber: '',
    type: 'Double' as Room['type'],
    rent: 4000,
    maxOccupancy: 2,
    extraBeds: 0,
    costPerBed: 0,
    floor: 1,
  });
  const [editForm, setEditForm] = useState({
    name: '',
    address: '',
    description: '',
    coverImage: '',
  });

  const house = houses.find(h => h.houseId === houseId);

  useEffect(() => {
    if (house) {
      setEditForm({
        name: house.name,
        address: house.address,
        description: house.description,
        coverImage: house.coverImage,
      });
    }
  }, [house?.houseId, house?.name, house?.address, house?.description, house?.coverImage]);

  const sortedRooms = useMemo(
    () => [...rooms].sort((a, b) => a.floor - b.floor || a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true })),
    [rooms]
  );

  const filteredRooms = statusFilter === 'all'
    ? sortedRooms
    : sortedRooms.filter(r => r.currentStatus === statusFilter);

  if (housesLoading || roomsLoading) {
    return <div className="p-8 text-center" style={{ color: 'var(--muted-foreground)' }}>Loading…</div>;
  }
  if (!house) return <div className="p-8" style={{ color: 'var(--muted-foreground)' }}>Property not found.</div>;

  const canEdit = canEditProperty(currentUser);
  const canManageRooms = canEditRooms(currentUser);

  const counts = {
    vacant: rooms.filter(r => r.currentStatus === 'vacant').length,
    occupied: rooms.filter(r => r.currentStatus === 'occupied').length,
    maintenance: rooms.filter(r => r.currentStatus === 'maintenance').length,
  };

  const handleDeleteHouse = async () => {
    if (!window.confirm('Delete this property and all its rooms? This cannot be undone.')) return;
    setDeleting(true);
    try {
      const roomsSnap = await getDocs(collection(db, 'houses', houseId, 'rooms'));
      const batch = writeBatch(db);
      roomsSnap.docs.forEach(r => batch.delete(r.ref));
      batch.delete(doc(db, 'houses', houseId));
      await batch.commit();
      toast.success('Property deleted.');
      onNavigate('houses');
    } catch (err) {
      console.error(err);
      toast.error('Could not delete property.');
      setDeleting(false);
    }
  };

  const handleSaveProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError('');
    setSavingEdit(true);
    try {
      await updateDoc(doc(db, 'houses', houseId), {
        name: editForm.name.trim(),
        address: editForm.address.trim(),
        description: editForm.description.trim(),
        coverImage: editForm.coverImage.trim(),
        roomCount: rooms.length,
      });
      setShowEdit(false);
      toast.success('Property updated.');
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to save property';
      setEditError(msg);
      toast.error(msg);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoom.roomNumber) return;
    setSavingRoom(true);
    try {
      const roomId = createId('r');
      await setDoc(doc(db, 'houses', houseId, 'rooms', roomId), {
        roomId,
        houseId,
        roomNumber: newRoom.roomNumber,
        type: newRoom.type,
        rent: Number(newRoom.rent) || 4000,
        maxOccupancy: Number(newRoom.maxOccupancy) || 1,
        extraBeds: Number(newRoom.extraBeds) || 0,
        costPerBed: Number(newRoom.costPerBed) || 0,
        currentStatus: 'vacant',
        floor: Number(newRoom.floor) || 1,
      });
      await updateDoc(doc(db, 'houses', houseId), { roomCount: rooms.length + 1 });
      setNewRoom({ roomNumber: '', type: 'Double', rent: 4000, maxOccupancy: 2, extraBeds: 0, costPerBed: 0, floor: 1 });
      setShowAddRoom(false);
      toast.success(`Room ${newRoom.roomNumber} added.`);
    } catch (err) {
      console.error(err);
      toast.error('Could not add room.');
    } finally {
      setSavingRoom(false);
    }
  };

  const startEditRoom = (room: Room) => {
    setEditingRoomId(room.roomId);
    setRoomEdit(roomDefaults(room));
    setShowAddRoom(false);
    setShowEdit(false);
  };

  const handleSaveRoomEdit = async (room: Room) => {
    if (!roomEdit) return;
    setSavingRoomEdit(true);
    try {
      await upsertRoom({
        ...room,
        roomNumber: roomEdit.roomNumber.trim(),
        type: roomEdit.type,
        rent: Number(roomEdit.rent) || 0,
        maxOccupancy: Number(roomEdit.maxOccupancy) || 1,
        extraBeds: Number(roomEdit.extraBeds) || 0,
        costPerBed: Number(roomEdit.costPerBed) || 0,
        floor: Number(roomEdit.floor) || 1,
        currentStatus: roomEdit.currentStatus,
      });
      setEditingRoomId(null);
      setRoomEdit(null);
      toast.success('Room updated.');
    } catch (err) {
      console.error(err);
      toast.error('Could not update room.');
    } finally {
      setSavingRoomEdit(false);
    }
  };

  const handleDeleteRoom = async (room: Room) => {
    if (room.currentStatus === 'occupied') {
      toast.error('This room is occupied. Check out the guest before deleting.');
      return;
    }
    setDeletingRoomId(room.roomId);
    try {
      const roomBookings = await fetchRoomBookings(db, room.roomId);
      const active = roomBookings.some(b => b.status === 'confirmed' || b.status === 'checked-in');
      if (active) {
        toast.error('This room has active bookings. Cancel or check them out first.');
        return;
      }
      if (!window.confirm(`Delete room ${room.roomNumber}? This cannot be undone.`)) return;
      await deleteDoc(doc(db, 'houses', houseId, 'rooms', room.roomId));
      await updateDoc(doc(db, 'houses', houseId), { roomCount: Math.max(0, rooms.length - 1) });
      if (editingRoomId === room.roomId) {
        setEditingRoomId(null);
        setRoomEdit(null);
      }
      toast.success(`Room ${room.roomNumber} deleted.`);
    } catch (err) {
      console.error(err);
      toast.error('Could not delete room.');
    } finally {
      setDeletingRoomId(null);
    }
  };

  const inputStyle = { background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' } as const;

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5 gap-2 flex-wrap">
        <button className="text-sm flex items-center gap-1" style={{ color: 'var(--muted-foreground)' }} onClick={() => onNavigate('houses')}>
          ← Properties
        </button>
        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <button
                onClick={() => { setShowEdit(v => !v); setShowAddRoom(false); setEditingRoomId(null); setEditError(''); }}
                className="text-xs px-3 py-1.5 rounded font-semibold"
                style={{ background: showEdit ? 'var(--secondary)' : 'var(--accent)', color: showEdit ? 'var(--foreground)' : 'white' }}
              >
                {showEdit ? 'Cancel' : 'Edit Property'}
              </button>
              <button
                onClick={() => { setShowAddRoom(v => !v); setShowEdit(false); setEditingRoomId(null); }}
                className="text-xs px-3 py-1.5 rounded font-semibold"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                {showAddRoom ? 'Cancel' : '+ Add Room'}
              </button>
            </>
          )}
          {canManageProperties(currentUser) && (
            <button
              onClick={handleDeleteHouse}
              disabled={deleting}
              className="text-xs px-3 py-1.5 rounded disabled:opacity-50"
              style={{ background: 'var(--status-occupied-bg)', color: 'var(--status-occupied)' }}
            >
              {deleting ? 'Deleting…' : 'Delete Property'}
            </button>
          )}
        </div>
      </div>

      {showEdit && canEdit && (
        <form onSubmit={handleSaveProperty} className="mb-6 p-5 rounded-xl space-y-3" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Edit Property</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Name</label>
              <input required value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="w-full px-3 py-2 rounded text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Address</label>
              <input required value={editForm.address} onChange={e => setEditForm({ ...editForm, address: e.target.value })} className="w-full px-3 py-2 rounded text-sm outline-none" style={inputStyle} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Description</label>
              <textarea value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} rows={2} className="w-full px-3 py-2 rounded text-sm outline-none" style={inputStyle} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Cover photo URL</label>
              <input type="url" value={editForm.coverImage} onChange={e => setEditForm({ ...editForm, coverImage: e.target.value })} className="w-full px-3 py-2 rounded text-sm outline-none" style={inputStyle} />
            </div>
          </div>
          {editError && <p className="text-sm" style={{ color: 'var(--status-occupied)' }}>{editError}</p>}
          <button type="submit" disabled={savingEdit} className="px-4 py-2 rounded text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--accent)', color: 'white' }}>
            {savingEdit ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      )}

      {showAddRoom && canEdit && (
        <form onSubmit={handleAddRoom} className="mb-6 p-5 rounded-xl space-y-3" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>New Room</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Room number</label>
              <input required value={newRoom.roomNumber} onChange={e => setNewRoom({ ...newRoom, roomNumber: e.target.value })} className="w-full px-3 py-2 rounded text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Type</label>
              <select value={newRoom.type} onChange={e => setNewRoom({ ...newRoom, type: e.target.value as Room['type'] })} className="w-full px-3 py-2 rounded text-sm outline-none" style={inputStyle}>
                <option value="Single">Single</option>
                <option value="Double">Double</option>
                <option value="Deluxe">Deluxe</option>
                <option value="Suite">Suite</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Rent / night</label>
              <input type="number" min={0} value={newRoom.rent} onChange={e => setNewRoom({ ...newRoom, rent: Number(e.target.value) })} className="w-full px-3 py-2 rounded text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>People accommodated</label>
              <input type="number" min={1} value={newRoom.maxOccupancy} onChange={e => setNewRoom({ ...newRoom, maxOccupancy: Number(e.target.value) })} className="w-full px-3 py-2 rounded text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Extra beds</label>
              <input type="number" min={0} value={newRoom.extraBeds} onChange={e => setNewRoom({ ...newRoom, extraBeds: Number(e.target.value) })} className="w-full px-3 py-2 rounded text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Cost per bed</label>
              <input type="number" min={0} value={newRoom.costPerBed} onChange={e => setNewRoom({ ...newRoom, costPerBed: Number(e.target.value) })} className="w-full px-3 py-2 rounded text-sm outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Floor</label>
              <input type="number" min={1} value={newRoom.floor} onChange={e => setNewRoom({ ...newRoom, floor: Number(e.target.value) })} className="w-full px-3 py-2 rounded text-sm outline-none" style={inputStyle} />
            </div>
          </div>
          <button type="submit" disabled={savingRoom} className="px-4 py-2 rounded text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--accent)', color: 'white' }}>
            {savingRoom ? 'Saving…' : 'Create Room'}
          </button>
        </form>
      )}

      {/* Property hero */}
      <div className="rounded-xl overflow-hidden mb-6" style={{ border: '1px solid var(--border)' }}>
        <div className="relative h-40">
          <img src={house.coverImage} alt={house.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(28,22,18,0.75) 0%, transparent 55%)' }} />
          <div className="absolute bottom-0 left-0 right-0 p-5">
            <h1 className="text-white text-3xl" style={{ fontFamily: 'DM Serif Display, serif' }}>{house.name}</h1>
            <p className="text-white/70 text-sm mt-0.5">{house.address}</p>
          </div>
        </div>
        <div className="p-4 flex flex-wrap items-center gap-4" style={{ background: 'var(--card)' }}>
          <div className="flex gap-5 flex-wrap text-sm">
            <span style={{ color: 'var(--muted-foreground)' }}><strong style={{ color: 'var(--foreground)' }}>{rooms.length}</strong> rooms</span>
            <span style={{ color: 'var(--status-vacant)' }}><strong>{counts.vacant}</strong> vacant</span>
            <span style={{ color: 'var(--status-occupied)' }}><strong>{counts.occupied}</strong> occupied</span>
            {counts.maintenance > 0 && (
              <span style={{ color: 'var(--status-maintenance)' }}><strong>{counts.maintenance}</strong> maintenance</span>
            )}
          </div>
          <button
            className="ml-auto px-4 py-2 rounded-md text-sm font-semibold"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            onClick={() => onNavigate('booking-new', { houseId })}
          >
            + New Booking
          </button>
        </div>
      </div>

      {/* Rooms toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--foreground)' }}>Rooms</h2>
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            {filteredRooms.length} of {rooms.length} shown
          </p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {([
            { id: 'all' as const, label: 'All', count: rooms.length },
            { id: 'vacant' as const, label: 'Vacant', count: counts.vacant },
            { id: 'occupied' as const, label: 'Occupied', count: counts.occupied },
            { id: 'maintenance' as const, label: 'Maintenance', count: counts.maintenance },
          ]).map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
              style={statusFilter === f.id
                ? { background: 'var(--primary)', color: 'var(--primary-foreground)' }
                : { background: 'var(--secondary)', color: 'var(--secondary-foreground)' }
              }
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>
      </div>

      {/* Room cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredRooms.map(room => {
          const status = STATUS_STYLE[room.currentStatus];
          const isEditing = editingRoomId === room.roomId && roomEdit;
          const people = room.maxOccupancy;
          const extraBeds = room.extraBeds ?? 0;
          const costPerBed = room.costPerBed ?? 0;
          const canBook = room.currentStatus === 'vacant';

          return (
            <div
              key={room.roomId}
              className="rounded-xl p-4 flex flex-col"
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                boxShadow: isEditing ? '0 8px 24px rgba(28,22,18,0.08)' : 'none',
              }}
            >
              {isEditing && roomEdit ? (
                <div className="space-y-2.5">
                  <div className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Edit room {room.roomNumber}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--muted-foreground)' }}>Room number</label>
                      <input value={roomEdit.roomNumber} onChange={e => setRoomEdit({ ...roomEdit, roomNumber: e.target.value })} className="w-full px-2.5 py-1.5 rounded text-sm outline-none" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--muted-foreground)' }}>Type</label>
                      <select value={roomEdit.type} onChange={e => setRoomEdit({ ...roomEdit, type: e.target.value as Room['type'] })} className="w-full px-2.5 py-1.5 rounded text-sm outline-none" style={inputStyle}>
                        <option value="Single">Single</option>
                        <option value="Double">Double</option>
                        <option value="Deluxe">Deluxe</option>
                        <option value="Suite">Suite</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--muted-foreground)' }}>Floor</label>
                      <input type="number" min={1} value={roomEdit.floor} onChange={e => setRoomEdit({ ...roomEdit, floor: Number(e.target.value) })} className="w-full px-2.5 py-1.5 rounded text-sm outline-none" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--muted-foreground)' }}>Rent / night</label>
                      <input type="number" min={0} value={roomEdit.rent} onChange={e => setRoomEdit({ ...roomEdit, rent: Number(e.target.value) })} className="w-full px-2.5 py-1.5 rounded text-sm outline-none" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--muted-foreground)' }}>People</label>
                      <input type="number" min={1} value={roomEdit.maxOccupancy} onChange={e => setRoomEdit({ ...roomEdit, maxOccupancy: Number(e.target.value) })} className="w-full px-2.5 py-1.5 rounded text-sm outline-none" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--muted-foreground)' }}>Extra beds</label>
                      <input type="number" min={0} value={roomEdit.extraBeds} onChange={e => setRoomEdit({ ...roomEdit, extraBeds: Number(e.target.value) })} className="w-full px-2.5 py-1.5 rounded text-sm outline-none" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--muted-foreground)' }}>Cost / bed</label>
                      <input type="number" min={0} value={roomEdit.costPerBed} onChange={e => setRoomEdit({ ...roomEdit, costPerBed: Number(e.target.value) })} className="w-full px-2.5 py-1.5 rounded text-sm outline-none" style={inputStyle} />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--muted-foreground)' }}>Status</label>
                      <select value={roomEdit.currentStatus} onChange={e => setRoomEdit({ ...roomEdit, currentStatus: e.target.value as RoomStatus })} className="w-full px-2.5 py-1.5 rounded text-sm outline-none" style={inputStyle}>
                        <option value="vacant">Vacant</option>
                        <option value="occupied">Occupied</option>
                        <option value="maintenance">Maintenance</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button type="button" disabled={savingRoomEdit} onClick={() => handleSaveRoomEdit(room)} className="flex-1 py-2 rounded text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                      {savingRoomEdit ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" onClick={() => { setEditingRoomId(null); setRoomEdit(null); }} className="flex-1 py-2 rounded text-xs font-semibold" style={{ background: 'var(--secondary)', color: 'var(--foreground)' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <div className="text-2xl leading-none mb-1" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--foreground)' }}>
                        {room.roomNumber}
                      </div>
                      <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{room.type} · Floor {room.floor}</div>
                    </div>
                    <span className="text-[11px] px-2 py-1 rounded-full font-semibold shrink-0" style={{ background: status.bg, color: status.text }}>
                      {status.label}
                    </span>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm mb-4">
                    <div>
                      <dt className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>Rent</dt>
                      <dd className="font-medium" style={{ color: 'var(--foreground)', fontFamily: 'DM Mono, monospace' }}>{formatCurrency(room.rent)}/night</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>People</dt>
                      <dd className="font-medium" style={{ color: 'var(--foreground)' }}>{people}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>Extra beds</dt>
                      <dd className="font-medium" style={{ color: 'var(--foreground)' }}>{extraBeds}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>Cost / bed</dt>
                      <dd className="font-medium" style={{ color: 'var(--foreground)', fontFamily: 'DM Mono, monospace' }}>{formatCurrency(costPerBed)}</dd>
                    </div>
                  </dl>

                  <div className="mt-auto space-y-2">
                    {canBook && (
                      <button
                        className="w-full py-2 rounded-md text-sm font-semibold"
                        style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                        onClick={() => onNavigate('booking-new', {
                          houseId,
                          roomId: room.roomId,
                          checkIn: today,
                          checkOut: nextDay(today),
                        })}
                      >
                        Book room
                      </button>
                    )}
                    <div className="flex gap-2">
                      {canManageRooms && (
                        <button
                          className="flex-1 py-2 rounded-md text-xs font-semibold"
                          style={{ background: 'var(--secondary)', color: 'var(--foreground)' }}
                          onClick={() => startEditRoom(room)}
                        >
                          Edit
                        </button>
                      )}
                      <button
                        className="flex-1 py-2 rounded-md text-xs font-semibold"
                        style={{ background: 'var(--secondary)', color: 'var(--foreground)' }}
                        onClick={() => onNavigate('room-detail', { houseId, roomId: room.roomId })}
                      >
                        Details
                      </button>
                      {canManageRooms && (
                        <button
                          disabled={deletingRoomId === room.roomId || room.currentStatus === 'occupied'}
                          className="flex-1 py-2 rounded-md text-xs font-semibold disabled:opacity-40"
                          style={{ background: 'var(--status-occupied-bg)', color: 'var(--status-occupied)' }}
                          title={room.currentStatus === 'occupied' ? 'Check out guest first' : 'Delete room'}
                          onClick={() => handleDeleteRoom(room)}
                        >
                          {deletingRoomId === room.roomId ? '…' : 'Delete'}
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
        {filteredRooms.length === 0 && (
          <div className="col-span-full text-sm py-12 text-center rounded-xl" style={{ color: 'var(--muted-foreground)', background: 'var(--card)', border: '1px dashed var(--border)' }}>
            {rooms.length === 0 ? 'No rooms yet. Add a room to get started.' : 'No rooms match this filter.'}
          </div>
        )}
      </div>
    </div>
  );
}
