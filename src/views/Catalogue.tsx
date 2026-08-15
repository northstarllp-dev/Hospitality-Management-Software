import { useMemo, useState } from 'react';
import type { CatalogueItem, House, User } from '../data/types';
import { formatCurrency } from '../data/types';
import { useCollection } from '../lib/firebase/hooks';
import { db } from '../lib/firebase/config';
import { doc, setDoc, updateDoc, deleteDoc, writeBatch, getDocs, collection, query, where } from 'firebase/firestore';
import { filterHousesByAccess } from '@/lib/permissions';
import { useToast } from '@/components/ToastProvider';
import { createId } from '@/lib/ids';

const CATEGORIES = ['Beverages', 'Food', 'Amenities', 'Laundry', 'Other'] as const;

interface Props {
  currentUser: User;
}

export default function Catalogue({ currentUser }: Props) {
  const toast = useToast();
  const { data: allItems, loading } = useCollection<CatalogueItem>('catalogue');
  const { data: allHouses } = useCollection<House>('houses');
  const houses = filterHousesByAccess(currentUser, allHouses);

  const [houseId, setHouseId] = useState('');
  const effectiveHouseId = houseId || houses[0]?.houseId || '';
  const items = useMemo(
    () => allItems.filter(i => i.houseId === effectiveHouseId),
    [allItems, effectiveHouseId]
  );

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', price: 0, category: 'Other' as CatalogueItem['category'] });
  const [dupFrom, setDupFrom] = useState('');
  const [duplicating, setDuplicating] = useState(false);
  const [dupMessage, setDupMessage] = useState('');
  const [dupItemId, setDupItemId] = useState<string | null>(null);
  const [dupItemTarget, setDupItemTarget] = useState('');
  const [dupItemBusy, setDupItemBusy] = useState(false);

  const startEdit = (item: CatalogueItem) => {
    setEditId(item.itemId);
    setEditName(item.name);
    setEditPrice(item.price);
  };

  const saveEdit = async () => {
    if (!editId) return;
    try {
      await updateDoc(doc(db, 'catalogue', editId), { name: editName, price: editPrice });
      toast.success('Item updated.');
    } catch (e) {
      console.error(e);
      toast.error('Could not update item.');
      return;
    }
    setEditId(null);
  };

  const deleteItem = async (id: string) => {
    if (!window.confirm('Delete this catalogue item?')) return;
    try {
      await deleteDoc(doc(db, 'catalogue', id));
      toast.success('Item deleted.');
    } catch (e) {
      console.error(e);
      toast.error('Could not delete item.');
    }
  };

  const duplicateItem = async (item: CatalogueItem, targetHouseId: string) => {
    if (!targetHouseId) return;
    setDupItemBusy(true);
    try {
      const itemId = `${targetHouseId}-i-${Date.now()}`;
      const sameHouse = targetHouseId === item.houseId;
      await setDoc(doc(db, 'catalogue', itemId), {
        itemId,
        houseId: targetHouseId,
        name: sameHouse ? `${item.name} (copy)` : item.name,
        price: item.price,
        category: item.category,
      });
      const targetName = houses.find(h => h.houseId === targetHouseId)?.name ?? targetHouseId;
      setDupMessage(sameHouse
        ? `Duplicated “${item.name}” in this catalogue.`
        : `Copied “${item.name}” to ${targetName}.`);
      setDupItemId(null);
      setDupItemTarget('');
    } catch (e) {
      console.error(e);
      setDupMessage('Could not duplicate item. Try again.');
    } finally {
      setDupItemBusy(false);
    }
  };

  const addItem = async () => {
    if (!newItem.name || !newItem.price || !effectiveHouseId) return;
    try {
      const itemId = createId('i');
      await setDoc(doc(db, 'catalogue', itemId), {
        ...newItem,
        itemId,
        houseId: effectiveHouseId,
      });
      setNewItem({ name: '', price: 0, category: 'Other' });
      setShowAdd(false);
      toast.success('Catalogue item added.');
    } catch (e) {
      console.error(e);
      toast.error('Could not add item.');
    }
  };

  const duplicateCatalogue = async () => {
    if (!dupFrom || !effectiveHouseId || dupFrom === effectiveHouseId) return;
    setDuplicating(true);
    setDupMessage('');
    try {
      const sourceSnap = await getDocs(
        query(collection(db, 'catalogue'), where('houseId', '==', dupFrom))
      );
      if (sourceSnap.empty) {
        setDupMessage('Source property has no catalogue items.');
        return;
      }

      // Replace target catalogue with a copy of source
      const existing = await getDocs(
        query(collection(db, 'catalogue'), where('houseId', '==', effectiveHouseId))
      );
      const batch = writeBatch(db);
      existing.docs.forEach(d => batch.delete(d.ref));
      sourceSnap.docs.forEach((d, idx) => {
        const data = d.data() as CatalogueItem;
        const itemId = `${effectiveHouseId}-copy-${Date.now()}-${idx}`;
        batch.set(doc(db, 'catalogue', itemId), {
          itemId,
          houseId: effectiveHouseId,
          name: data.name,
          price: data.price,
          category: data.category,
        });
      });
      await batch.commit();
      const fromName = houses.find(h => h.houseId === dupFrom)?.name ?? dupFrom;
      setDupMessage(`Copied ${sourceSnap.size} items from ${fromName}.`);
      setDupFrom('');
    } catch (e) {
      console.error(e);
      setDupMessage('Duplicate failed. Try again.');
    } finally {
      setDuplicating(false);
    }
  };

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--muted-foreground)' }}>Loading catalogue…</div>;
  if (!houses.length) return <div className="p-8 text-center" style={{ color: 'var(--muted-foreground)' }}>No properties available.</div>;

  const otherHouses = houses.filter(h => h.houseId !== effectiveHouseId);

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="flex items-end justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl mb-1" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--foreground)' }}>Purchase Catalogue</h1>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{items.length} items for this property</p>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="px-4 py-2 rounded-md text-sm font-semibold"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
        >
          {showAdd ? 'Cancel' : '+ Add Item'}
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-5 items-end">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Property</label>
          <select
            value={effectiveHouseId}
            onChange={e => { setHouseId(e.target.value); setDupMessage(''); }}
            className="px-3 py-2 rounded-md text-sm outline-none min-w-52"
            style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
          >
            {houses.map(h => <option key={h.houseId} value={h.houseId}>{h.name}</option>)}
          </select>
        </div>
        {otherHouses.length > 0 && (
          <>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Duplicate from</label>
              <select
                value={dupFrom}
                onChange={e => setDupFrom(e.target.value)}
                className="px-3 py-2 rounded-md text-sm outline-none min-w-52"
                style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              >
                <option value="">Select property…</option>
                {otherHouses.map(h => <option key={h.houseId} value={h.houseId}>{h.name}</option>)}
              </select>
            </div>
            <button
              onClick={duplicateCatalogue}
              disabled={!dupFrom || duplicating}
              className="px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-50"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              {duplicating ? 'Copying…' : 'Duplicate catalogue'}
            </button>
          </>
        )}
      </div>
      {dupMessage && (
        <p className="text-sm mb-4" style={{ color: 'var(--muted-foreground)' }}>{dupMessage}</p>
      )}

      {showAdd && (
        <div className="rounded-lg p-5 mb-6" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--foreground)' }}>New Item</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="Item name"
              value={newItem.name}
              onChange={e => setNewItem({ ...newItem, name: e.target.value })}
              className="px-3 py-2 rounded text-sm outline-none"
              style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
            />
            <input
              type="number"
              placeholder="Price (₹)"
              value={newItem.price || ''}
              onChange={e => setNewItem({ ...newItem, price: Number(e.target.value) })}
              className="px-3 py-2 rounded text-sm outline-none"
              style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
            />
            <select
              value={newItem.category}
              onChange={e => setNewItem({ ...newItem, category: e.target.value as CatalogueItem['category'] })}
              className="px-3 py-2 rounded text-sm outline-none"
              style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button
            onClick={addItem}
            className="mt-3 px-4 py-2 rounded text-sm font-semibold"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            Add to Catalogue
          </button>
        </div>
      )}

      {CATEGORIES.map(cat => {
        const catItems = items.filter(i => i.category === cat);
        if (!catItems.length) return null;
        return (
          <div key={cat} className="mb-6">
            <div className="text-xs font-medium mb-2" style={{ color: 'var(--muted-foreground)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {cat}
            </div>
            <div className="rounded-lg overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              {catItems.map((item, i) => (
                <div
                  key={item.itemId}
                  className="flex items-center gap-4 px-5 py-3"
                  style={{ borderBottom: i < catItems.length - 1 ? '1px solid var(--border)' : 'none' }}
                >
                  {editId === item.itemId ? (
                    <>
                      <input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="flex-1 px-2 py-1 rounded text-sm outline-none"
                        style={{ background: 'var(--background)', border: '1px solid var(--primary)', color: 'var(--foreground)' }}
                      />
                      <input
                        type="number"
                        value={editPrice}
                        onChange={e => setEditPrice(Number(e.target.value))}
                        className="w-24 px-2 py-1 rounded text-sm outline-none"
                        style={{ background: 'var(--background)', border: '1px solid var(--primary)', color: 'var(--foreground)', fontFamily: 'DM Mono, monospace' }}
                      />
                      <button onClick={saveEdit} className="text-xs px-3 py-1.5 rounded font-medium" style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>Save</button>
                      <button onClick={() => setEditId(null)} className="text-xs px-3 py-1.5 rounded font-medium" style={{ background: 'var(--secondary)', color: 'var(--secondary-foreground)' }}>Cancel</button>
                    </>
                  ) : dupItemId === item.itemId ? (
                    <>
                      <div className="flex-1 text-sm" style={{ color: 'var(--foreground)' }}>{item.name}</div>
                      <select
                        value={dupItemTarget}
                        onChange={e => setDupItemTarget(e.target.value)}
                        className="px-2 py-1 rounded text-xs outline-none min-w-40"
                        style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                      >
                        <option value={effectiveHouseId}>This property</option>
                        {otherHouses.map(h => (
                          <option key={h.houseId} value={h.houseId}>{h.name}</option>
                        ))}
                      </select>
                      <button
                        disabled={dupItemBusy || !dupItemTarget}
                        onClick={() => duplicateItem(item, dupItemTarget || effectiveHouseId)}
                        className="text-xs px-3 py-1.5 rounded font-medium disabled:opacity-50"
                        style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                      >
                        {dupItemBusy ? 'Copying…' : 'Copy'}
                      </button>
                      <button
                        onClick={() => { setDupItemId(null); setDupItemTarget(''); }}
                        className="text-xs px-3 py-1.5 rounded font-medium"
                        style={{ background: 'var(--secondary)', color: 'var(--secondary-foreground)' }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 text-sm" style={{ color: 'var(--foreground)' }}>{item.name}</div>
                      <div className="text-sm font-medium" style={{ color: 'var(--foreground)', fontFamily: 'DM Mono, monospace' }}>{formatCurrency(item.price)}</div>
                      <button onClick={() => startEdit(item)} className="text-xs" style={{ color: 'var(--accent)' }}>Edit</button>
                      <button
                        onClick={() => {
                          setEditId(null);
                          setDupItemId(item.itemId);
                          setDupItemTarget(effectiveHouseId);
                          setDupMessage('');
                        }}
                        className="text-xs"
                        style={{ color: 'var(--accent)' }}
                      >
                        Duplicate
                      </button>
                      <button onClick={() => deleteItem(item.itemId)} className="text-xs" style={{ color: 'var(--status-occupied)' }}>Delete</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {items.length === 0 && (
        <div className="rounded-lg p-10 text-center text-sm" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>
          No items for this property yet. Add items or duplicate from another property.
        </div>
      )}
    </div>
  );
}
