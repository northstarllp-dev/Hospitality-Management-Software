"use client";

import { useMemo, useState } from 'react';
import type { User, House, Company } from '../data/types';
import { useCollection } from '../lib/firebase/hooks';
import { db, firebaseConfig } from '../lib/firebase/config';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { initializeApp, deleteApp, getApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import {
  canAssignStaff,
  filterHousesByAccess,
  getAssignedHouseIds,
  isPropertyOwner,
  isSuperAdmin,
  normalizeRole,
  roleDisplayLabel,
} from '@/lib/permissions';
import { useToast } from '@/components/ToastProvider';
import CompanyFilter from '@/components/CompanyFilter';

interface Props {
  currentUser: User;
  initialCompanyFilter?: string;
}

async function createAuthAccount(email: string, password: string) {
  const appName = `Secondary-${Date.now()}`;
  const secondary = initializeApp(firebaseConfig, appName);
  try {
    const secondaryAuth = getAuth(secondary);
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    return cred.user.uid;
  } finally {
    await deleteApp(secondary).catch(() => {
      try {
        deleteApp(getApp(appName));
      } catch {
        /* ignore */
      }
    });
  }
}

function houseLabel(houses: House[], ids: string[]) {
  if (!ids.length) return 'No properties assigned';
  return ids
    .map(id => houses.find(h => h.houseId === id)?.name ?? id)
    .join(', ');
}

export default function Staff({ currentUser, initialCompanyFilter = '' }: Props) {
  const toast = useToast();
  const { data: allUsers, loading: usersLoading } = useCollection<User>('users');
  const { data: allHouses } = useCollection<House>('houses');
  const { data: companies } = useCollection<Company>('companies');
  const manageableHouses = filterHousesByAccess(currentUser, allHouses);

  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHouses, setEditHouses] = useState<string[]>([]);
  const [editCompanyId, setEditCompanyId] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [companyFilter, setCompanyFilter] = useState(initialCompanyFilter);

  const isSuper = isSuperAdmin(currentUser);
  const isOwner = isPropertyOwner(currentUser);
  const myHouseIds = useMemo(() => new Set(getAssignedHouseIds(currentUser)), [currentUser]);

  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: (isSuper ? 'admin' : 'staff') as User['role'],
    companyId: initialCompanyFilter && initialCompanyFilter !== '__none__' ? initialCompanyFilter : '',
    assignedHouses: [] as string[],
  });

  const roleLabel = (role: User['role']) => roleDisplayLabel(role);
  const roleBadge = (role: User['role']) =>
    ({
      superadmin: { bg: 'var(--primary)', text: 'var(--primary-foreground)' },
      admin: { bg: '#FEF3E2', text: 'var(--accent)' },
      staff: { bg: 'var(--secondary)', text: 'var(--secondary-foreground)' },
    }[normalizeRole(role)]);

  const companyName = (id?: string | null) =>
    companies.find(c => c.companyId === id)?.name;

  const userMatchesCompany = (user: User, filter: string) => {
    if (!filter) return true;
    if (filter === '__none__') return !user.companyId;
    if (user.companyId === filter) return true;
    // Also match if their assigned properties belong to this company
    const ids = getAssignedHouseIds(user);
    return ids.some(hid => allHouses.find(h => h.houseId === hid)?.companyId === filter);
  };

  const staffList = useMemo(() => {
    const others = allUsers.filter(u => u.uid !== currentUser.uid && normalizeRole(u.role) !== 'superadmin');
    let list = others;
    if (!isSuper) {
      list = others.filter(u => {
        if (normalizeRole(u.role) !== 'staff') return false;
        const ids = getAssignedHouseIds(u);
        return ids.some(id => myHouseIds.has(id));
      });
    } else if (companyFilter) {
      list = others.filter(u => userMatchesCompany(u, companyFilter));
    }
    return list;
  }, [allUsers, currentUser.uid, isSuper, myHouseIds, companyFilter, allHouses]);

  const housesForForm = useMemo(() => {
    const base = isSuper ? allHouses : manageableHouses;
    const companyId = newUser.companyId;
    if (isSuper && companyId) {
      return base.filter(h => h.companyId === companyId);
    }
    return base;
  }, [isSuper, allHouses, manageableHouses, newUser.companyId]);

  const housesForEdit = useMemo(() => {
    const base = isSuper ? allHouses : manageableHouses;
    if (isSuper && editCompanyId) {
      return base.filter(h => h.companyId === editCompanyId);
    }
    return base;
  }, [isSuper, allHouses, manageableHouses, editCompanyId]);

  const toggleHouse = (houseId: string, list: string[], setList: (v: string[]) => void, multi: boolean) => {
    if (multi) {
      setList(list.includes(houseId) ? list.filter(id => id !== houseId) : [...list, houseId]);
    } else {
      setList(list.includes(houseId) ? [] : [houseId]);
    }
  };

  const addUser = async () => {
    if (!canAssignStaff(currentUser)) return;
    if (!newUser.name || !newUser.email || !newUser.password) {
      setError('Name, email, and password are required.');
      return;
    }
    if (newUser.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    const role = isOwner ? 'staff' : normalizeRole(newUser.role);
    if (role === 'admin' && !isSuper) {
      setError('Only Super Admin can create property owners.');
      return;
    }
    if (isSuper && !newUser.companyId) {
      setError('Assign this login to a company.');
      return;
    }
    if (newUser.assignedHouses.length === 0) {
      setError(role === 'admin' ? 'Assign at least one property to this owner.' : 'Assign a property to this staff member.');
      return;
    }
    if (role === 'staff' && newUser.assignedHouses.length !== 1) {
      setError('Maintenance staff must be assigned to exactly one property.');
      return;
    }
    if (isOwner && !newUser.assignedHouses.every(id => myHouseIds.has(id))) {
      setError('You can only assign staff to your own properties.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const uid = await createAuthAccount(newUser.email.trim(), newUser.password);
      const assignedHouses = [...newUser.assignedHouses];
      const assignedHouse = role === 'staff' ? assignedHouses[0] : null;
      const companyId = isSuper
        ? newUser.companyId
        : (currentUser.companyId || allHouses.find(h => h.houseId === assignedHouses[0])?.companyId || null);

      await setDoc(doc(db, 'users', uid), {
        uid,
        name: newUser.name.trim(),
        email: newUser.email.trim(),
        role,
        assignedHouse,
        assignedHouses,
        companyId: companyId || null,
      });
      setNewUser({
        name: '',
        email: '',
        password: '',
        role: isSuper ? 'admin' : 'staff',
        companyId: companyFilter && companyFilter !== '__none__' ? companyFilter : '',
        assignedHouses: [],
      });
      setShowAdd(false);
      toast.success(role === 'admin' ? 'Property owner created.' : 'Maintenance staff created.');
    } catch (e: any) {
      console.error('Error adding user:', e);
      if (e?.code === 'auth/email-already-in-use') {
        setError('That email already has an account.');
      } else if (e?.code === 'auth/invalid-email') {
        setError('Enter a valid email address.');
      } else {
        setError(e?.message || 'Could not create account.');
      }
    } finally {
      setSaving(false);
    }
  };

  const startEditAccess = (user: User) => {
    setEditingId(user.uid || (user as any).id);
    setEditHouses(getAssignedHouseIds(user));
    setEditCompanyId(user.companyId || '');
    setShowAdd(false);
  };

  const saveAccess = async (user: User) => {
    const userId = user.uid || (user as any).id;
    if (!userId) return;
    const role = normalizeRole(user.role);

    if (role === 'admin' && !isSuper) {
      toast.error('Only Super Admin can edit owner property access.');
      return;
    }
    if (isSuper && !editCompanyId) {
      toast.error('Assign this login to a company.');
      return;
    }
    if (editHouses.length === 0) {
      toast.error('Assign at least one property.');
      return;
    }
    if (role === 'staff' && editHouses.length !== 1) {
      toast.error('Maintenance staff must have exactly one property.');
      return;
    }
    if (isOwner) {
      if (role !== 'staff' || !editHouses.every(id => myHouseIds.has(id))) {
        toast.error('You can only assign staff to your own properties.');
        return;
      }
    }

    setSavingEdit(true);
    try {
      const payload: Record<string, unknown> = {
        assignedHouses: editHouses,
        assignedHouse: role === 'staff' ? editHouses[0] : null,
      };
      if (isSuper) payload.companyId = editCompanyId || null;
      await updateDoc(doc(db, 'users', userId), payload);
      toast.success('Access updated.');
      setEditingId(null);
      setEditHouses([]);
      setEditCompanyId('');
    } catch (e) {
      console.error(e);
      toast.error('Could not update access.');
    } finally {
      setSavingEdit(false);
    }
  };

  const canEditThisUser = (user: User) => {
    const role = normalizeRole(user.role);
    if (isSuper && role !== 'superadmin') return true;
    if (isOwner && role === 'staff') {
      const ids = getAssignedHouseIds(user);
      return ids.some(id => myHouseIds.has(id)) || ids.length === 0;
    }
    return false;
  };

  const canRemoveThisUser = (user: User) => {
    if (isSuper && normalizeRole(user.role) !== 'superadmin') return true;
    if (isOwner && normalizeRole(user.role) === 'staff') {
      return getAssignedHouseIds(user).some(id => myHouseIds.has(id));
    }
    return false;
  };

  if (usersLoading) {
    return <div className="p-8 text-center" style={{ color: 'var(--muted-foreground)' }}>Loading team…</div>;
  }

  if (isOwner && manageableHouses.length === 0) {
    return (
      <div className="p-8 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
        No properties assigned to you yet. Ask Super Admin to grant property access before managing staff.
      </div>
    );
  }

  const inputStyle = { background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' } as const;

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="flex items-end justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl mb-1" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--foreground)' }}>Team</h1>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            {isSuper
              ? `${staffList.length} logins · filter & assign under companies`
              : `${staffList.length} maintenance staff on your properties`}
          </p>
        </div>
        {canAssignStaff(currentUser) && (
          <button
            onClick={() => { setShowAdd(v => !v); setError(''); setEditingId(null); }}
            className="px-4 py-2 rounded-md text-sm font-semibold"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            {showAdd ? 'Cancel' : isSuper ? '+ Add Login' : '+ Add Staff'}
          </button>
        )}
      </div>

      {isSuper && (
        <div className="mb-6">
          <CompanyFilter
            companies={companies}
            value={companyFilter}
            onChange={(v) => {
              setCompanyFilter(v);
              if (v && v !== '__none__') {
                setNewUser(prev => ({ ...prev, companyId: v, assignedHouses: [] }));
              }
            }}
          />
        </div>
      )}

      {showAdd && canAssignStaff(currentUser) && (
        <div className="rounded-lg p-5 mb-6" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--foreground)' }}>New Login</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <input
              type="text"
              placeholder="Full name"
              value={newUser.name}
              onChange={e => setNewUser({ ...newUser, name: e.target.value })}
              className="px-3 py-2 rounded text-sm outline-none"
              style={inputStyle}
            />
            <input
              type="email"
              placeholder="Email address"
              value={newUser.email}
              onChange={e => setNewUser({ ...newUser, email: e.target.value })}
              className="px-3 py-2 rounded text-sm outline-none"
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="Temporary password"
              value={newUser.password}
              onChange={e => setNewUser({ ...newUser, password: e.target.value })}
              className="px-3 py-2 rounded text-sm outline-none"
              style={inputStyle}
            />
            {isSuper ? (
              <select
                value={newUser.role}
                onChange={e => setNewUser({ ...newUser, role: e.target.value as User['role'], assignedHouses: [] })}
                className="px-3 py-2 rounded text-sm outline-none"
                style={inputStyle}
              >
                <option value="admin">Property Owner</option>
                <option value="staff">Maintenance</option>
              </select>
            ) : (
              <div className="px-3 py-2 rounded text-sm" style={{ ...inputStyle, opacity: 0.85 }}>
                Role: Maintenance
              </div>
            )}
            {isSuper && (
              <select
                value={newUser.companyId}
                onChange={e => setNewUser({ ...newUser, companyId: e.target.value, assignedHouses: [] })}
                className="px-3 py-2 rounded text-sm outline-none sm:col-span-2"
                style={inputStyle}
              >
                <option value="">Company *</option>
                {companies.map(c => (
                  <option key={c.companyId} value={c.companyId}>{c.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="mb-3">
            <div className="text-xs font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>
              {newUser.role === 'admin' && isSuper
                ? 'Properties under this company (select one or more)'
                : 'Assign property (required)'}
            </div>
            <div className="flex flex-wrap gap-2">
              {housesForForm.map(h => {
                const selected = newUser.assignedHouses.includes(h.houseId);
                const multi = isSuper && newUser.role === 'admin';
                return (
                  <button
                    key={h.houseId}
                    type="button"
                    onClick={() =>
                      toggleHouse(h.houseId, newUser.assignedHouses, (v) => setNewUser({ ...newUser, assignedHouses: v }), multi)
                    }
                    className="text-xs px-3 py-1.5 rounded-md font-medium"
                    style={{
                      background: selected ? 'var(--primary)' : 'var(--secondary)',
                      color: selected ? 'var(--primary-foreground)' : 'var(--secondary-foreground)',
                    }}
                  >
                    {h.name}
                  </button>
                );
              })}
              {housesForForm.length === 0 && (
                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  {isSuper && !newUser.companyId
                    ? 'Select a company first to see its properties.'
                    : 'No properties available for this company.'}
                </span>
              )}
            </div>
          </div>

          {error && (
            <div className="text-sm mb-3 px-3 py-2 rounded" style={{ background: 'var(--status-occupied-bg)', color: 'var(--status-occupied)' }}>
              {error}
            </div>
          )}
          <button
            onClick={addUser}
            disabled={saving}
            className="px-4 py-2 rounded text-sm font-semibold"
            style={{ background: 'var(--accent)', color: 'white', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Creating…' : 'Create Login'}
          </button>
        </div>
      )}

      <div className="rounded-lg overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        {staffList.length === 0 && (
          <div className="px-5 py-10 text-sm text-center" style={{ color: 'var(--muted-foreground)' }}>
            {isSuper ? 'No logins for this company filter.' : 'No maintenance staff on your properties yet.'}
          </div>
        )}
        {staffList.map((user, i) => {
          const rb = roleBadge(user.role);
          const userId = user.uid || (user as any).id;
          const ids = getAssignedHouseIds(user);
          const editing = editingId === userId;
          const co = companyName(user.companyId);

          return (
            <div
              key={userId || i}
              className="px-5 py-4"
              style={{ borderBottom: i < staffList.length - 1 ? '1px solid var(--border)' : 'none' }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                  style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                >
                  {user.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{user.name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: rb.bg, color: rb.text }}>
                      {roleLabel(user.role)}
                    </span>
                    {co && (
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--secondary)', color: 'var(--secondary-foreground)' }}>
                        {co}
                      </span>
                    )}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                    {user.email}
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                    {houseLabel(allHouses, ids)}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {canEditThisUser(user) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (editing) {
                          setEditingId(null);
                          setEditHouses([]);
                          setEditCompanyId('');
                        } else {
                          startEditAccess(user);
                        }
                      }}
                      className="text-xs px-3 py-1.5 rounded font-medium"
                      style={{ background: 'var(--secondary)', color: 'var(--secondary-foreground)' }}
                    >
                      {editing ? 'Cancel' : 'Edit access'}
                    </button>
                  )}
                  {canRemoveThisUser(user) && (
                    <button
                      disabled={removingId === userId}
                      onClick={async () => {
                        if (!userId) return;
                        if (!window.confirm(`Remove ${user.name}? They will lose app access.`)) return;
                        setRemovingId(userId);
                        try {
                          await deleteDoc(doc(db, 'users', userId));
                          toast.success(`${user.name} removed.`);
                        } catch (e) {
                          console.error(e);
                          toast.error('Could not remove team member.');
                        } finally {
                          setRemovingId(null);
                        }
                      }}
                      className="text-xs px-3 py-1.5 rounded disabled:opacity-60"
                      style={{ background: 'var(--status-occupied-bg)', color: 'var(--status-occupied)' }}
                    >
                      {removingId === userId ? 'Removing…' : 'Remove'}
                    </button>
                  )}
                </div>
              </div>

              {editing && (
                <div className="mt-3">
                  {isSuper && (
                    <div className="mb-3">
                      <div className="text-xs font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>Company</div>
                      <select
                        value={editCompanyId}
                        onChange={e => {
                          setEditCompanyId(e.target.value);
                          setEditHouses([]);
                        }}
                        className="px-3 py-2 rounded text-sm outline-none w-full max-w-sm"
                        style={inputStyle}
                      >
                        <option value="">Select company…</option>
                        {companies.map(c => (
                          <option key={c.companyId} value={c.companyId}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="text-xs font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>
                    {normalizeRole(user.role) === 'admin'
                      ? 'Properties this owner can access'
                      : 'Assign property'}
                  </div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {housesForEdit.map(h => {
                      const selected = editHouses.includes(h.houseId);
                      const multi = normalizeRole(user.role) === 'admin';
                      return (
                        <button
                          key={h.houseId}
                          type="button"
                          onClick={() => toggleHouse(h.houseId, editHouses, setEditHouses, multi)}
                          className="text-xs px-3 py-1.5 rounded-md font-medium"
                          style={{
                            background: selected ? 'var(--primary)' : 'var(--secondary)',
                            color: selected ? 'var(--primary-foreground)' : 'var(--secondary-foreground)',
                          }}
                        >
                          {h.name}
                        </button>
                      );
                    })}
                    {housesForEdit.length === 0 && (
                      <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                        Select a company to see its properties.
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={savingEdit}
                    onClick={() => saveAccess(user)}
                    className="text-xs px-3 py-1.5 rounded font-semibold disabled:opacity-60"
                    style={{ background: 'var(--accent)', color: 'white' }}
                  >
                    {savingEdit ? 'Saving…' : 'Save access'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
