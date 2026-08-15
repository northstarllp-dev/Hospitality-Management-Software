import { useState } from 'react';
import type { User, House } from '../data/types';
import { useCollection } from '../lib/firebase/hooks';
import { db, firebaseConfig } from '../lib/firebase/config';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { initializeApp, deleteApp, getApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { canManageStaff, isSuperAdmin, normalizeRole, roleDisplayLabel } from '@/lib/permissions';
import { useToast } from '@/components/ToastProvider';

interface Props {
  currentUser: User;
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

export default function Staff({ currentUser }: Props) {
  const toast = useToast();
  const { data: allUsers, loading: usersLoading } = useCollection<User>('users');
  const { data: HOUSES } = useCollection<House>('houses');
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'staff' as User['role'],
    assignedHouse: '',
  });
  const [saving, setSaving] = useState(false);

  const roleLabel = (role: User['role']) => roleDisplayLabel(role);
  const roleBadge = (role: User['role']) =>
    ({
      superadmin: { bg: 'var(--primary)', text: 'var(--primary-foreground)' },
      admin: { bg: '#FEF3E2', text: 'var(--accent)' },
      staff: { bg: 'var(--secondary)', text: 'var(--secondary-foreground)' },
    }[normalizeRole(role)]);

  const staffList = isSuperAdmin(currentUser)
    ? allUsers.filter(u => u.uid !== currentUser.uid)
    : allUsers.filter(u => normalizeRole(u.role) === 'staff');

  const addUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.password) {
      setError('Name, email, and password are required.');
      return;
    }
    if (newUser.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const uid = await createAuthAccount(newUser.email.trim(), newUser.password);
      await setDoc(doc(db, 'users', uid), {
        uid,
        name: newUser.name.trim(),
        email: newUser.email.trim(),
        role: normalizeRole(newUser.role),
        assignedHouse: newUser.role === 'staff' ? newUser.assignedHouse || null : null,
      });
      setNewUser({ name: '', email: '', password: '', role: 'staff', assignedHouse: '' });
      setShowAdd(false);
      toast.success('Staff account created.');
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

  if (usersLoading) {
    return <div className="p-8 text-center" style={{ color: 'var(--muted-foreground)' }}>Loading staff…</div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="flex items-end justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl mb-1" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--foreground)' }}>Team</h1>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            {staffList.length} accounts · property owners &amp; maintenance
          </p>
        </div>
        {canManageStaff(currentUser) && (
          <button
            onClick={() => { setShowAdd(v => !v); setError(''); }}
            className="px-4 py-2 rounded-md text-sm font-semibold"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            {showAdd ? 'Cancel' : '+ Add Person'}
          </button>
        )}
      </div>

      {showAdd && canManageStaff(currentUser) && (
        <div className="rounded-lg p-5 mb-6" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--foreground)' }}>New Account</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <input
              type="text"
              placeholder="Full name"
              value={newUser.name}
              onChange={e => setNewUser({ ...newUser, name: e.target.value })}
              className="px-3 py-2 rounded text-sm outline-none"
              style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
            />
            <input
              type="email"
              placeholder="Email address"
              value={newUser.email}
              onChange={e => setNewUser({ ...newUser, email: e.target.value })}
              className="px-3 py-2 rounded text-sm outline-none"
              style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
            />
            <input
              type="password"
              placeholder="Temporary password"
              value={newUser.password}
              onChange={e => setNewUser({ ...newUser, password: e.target.value })}
              className="px-3 py-2 rounded text-sm outline-none"
              style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
            />
            <select
              value={newUser.role}
              onChange={e => setNewUser({ ...newUser, role: e.target.value as User['role'] })}
              className="px-3 py-2 rounded text-sm outline-none"
              style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
            >
              <option value="admin">Property Owner</option>
              <option value="staff">Maintenance</option>
            </select>
            {newUser.role === 'staff' && (
              <select
                value={newUser.assignedHouse}
                onChange={e => setNewUser({ ...newUser, assignedHouse: e.target.value })}
                className="px-3 py-2 rounded text-sm outline-none sm:col-span-2"
                style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              >
                <option value="">Assign property…</option>
                {HOUSES.map(h => (
                  <option key={h.houseId} value={h.houseId}>{h.name}</option>
                ))}
              </select>
            )}
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
            {saving ? 'Creating…' : 'Create Account'}
          </button>
        </div>
      )}

      <div className="rounded-lg overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        {staffList.map((user, i) => {
          const rb = roleBadge(user.role);
          const assignedHouse = user.assignedHouse ? HOUSES.find(h => h.houseId === user.assignedHouse) : null;
          const userId = user.uid || (user as any).id;
          return (
            <div
              key={userId || i}
              className="flex items-center gap-4 px-5 py-4"
              style={{ borderBottom: i < staffList.length - 1 ? '1px solid var(--border)' : 'none' }}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                {user.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{user.name}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: rb.bg, color: rb.text }}>
                    {roleLabel(user.role)}
                  </span>
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                  {user.email}
                  {assignedHouse && ` · ${assignedHouse.name}`}
                </div>
              </div>
              {canManageStaff(currentUser) && user.uid !== currentUser.uid && normalizeRole(user.role) !== 'superadmin' && (
                <button
                  disabled={removingId === userId}
                  onClick={async () => {
                    if (!userId) return;
                    if (!window.confirm(`Remove ${user.name} from Havens? They will lose app access. (Firebase Auth account must be deleted separately in the console.)`)) return;
                    setRemovingId(userId);
                    try {
                      await deleteDoc(doc(db, 'users', userId));
                      toast.success(`${user.name} removed.`);
                    } catch (e) {
                      console.error(e);
                      toast.error('Could not remove staff member.');
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
          );
        })}
      </div>
    </div>
  );
}
