import { useState } from 'react';
import { USERS } from '../data/mock';
import type { User } from '../data/types';
import { auth, db } from '@/lib/firebase/config';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { normalizeRole } from '@/lib/permissions';
import InstallAppButton from '@/components/InstallAppButton';

interface LoginProps {
  onLogin: (user: User) => void;
}

async function loadUserProfile(uid: string, email: string | null): Promise<User | null> {
  const byUid = await getDoc(doc(db, 'users', uid));
  if (byUid.exists()) {
    const data = byUid.data();
    const { password: _password, ...safe } = data as User & { password?: string };
    return { ...safe, uid, role: normalizeRole(safe.role) } as User;
  }

  if (!email) return null;

  const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
  if (snap.empty) return null;

  const data = snap.docs[0].data();
  const { password: _password, ...safe } = data as User & { password?: string };
  return { ...safe, uid, role: normalizeRole(safe.role) } as User;
}

function authErrorMessage(code?: string) {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'Invalid email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection.';
    default:
      return 'Unable to sign in. Please try again.';
  }
}

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<'email' | 'password' | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const profile = await loadUserProfile(cred.user.uid, cred.user.email);

      if (!profile) {
        await signOut(auth);
        setError('Signed in, but no staff profile was found. Ask an admin to set up your account.');
        return;
      }

      onLogin(profile);
    } catch (err: any) {
      console.error(err);
      setError(authErrorMessage(err?.code));
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = async (user: User) => {
    setEmail(user.email);
    setPassword(user.password ?? '');
    setError('');
    setLoading(true);

    try {
      const cred = await signInWithEmailAndPassword(auth, user.email, user.password ?? '');
      const profile = await loadUserProfile(cred.user.uid, cred.user.email);

      if (!profile) {
        await signOut(auth);
        setError('Signed in, but no staff profile was found. Run the seed script or ask an admin.');
        return;
      }

      onLogin(profile);
    } catch (err: any) {
      console.error(err);
      setError(authErrorMessage(err?.code));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden px-4 py-10">
      {/* Full-bleed backdrop */}
      <img
        src="https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1600&h=1200&fit=crop&auto=format"
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover"
        style={{ animation: 'loginKenburns 28s ease-in-out infinite alternate' }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(160deg, rgba(28,22,18,0.55) 0%, rgba(42,82,68,0.45) 45%, rgba(28,22,18,0.7) 100%)',
        }}
      />

      {/* Soft ambient orbs */}
      <div
        className="pointer-events-none absolute -top-24 -left-24 w-80 h-80 rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(184,115,51,0.45), transparent 70%)' }}
      />
      <div
        className="pointer-events-none absolute -bottom-32 -right-16 w-96 h-96 rounded-full opacity-35 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(42,82,68,0.55), transparent 70%)' }}
      />

      {/* Glass login popup */}
      <div
        className="relative z-10 w-full max-w-[420px]"
        style={{ animation: 'loginFadeUp 0.7s ease-out both' }}
      >
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(253, 250, 247, 0.88)',
            backdropFilter: 'blur(40px) saturate(1.5)',
            WebkitBackdropFilter: 'blur(40px) saturate(1.5)',
            border: '1px solid rgba(255, 255, 255, 0.7)',
            boxShadow:
              '0 28px 64px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.9)',
          }}
        >
          {/* Top sheen */}
          <div
            className="h-px w-full"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)',
            }}
          />

          <div className="px-7 pt-8 pb-7 sm:px-9 sm:pt-10 sm:pb-8">
            {/* Brand */}
            <div className="flex flex-col items-center text-center mb-8">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4"
                style={{
                  background: '#B87333',
                  color: '#FDFAF7',
                  boxShadow: '0 8px 24px rgba(184,115,51,0.4)',
                }}
              >
                ⌂
              </div>
              <h1
                className="text-3xl sm:text-4xl tracking-tight mb-1.5"
                style={{ fontFamily: 'DM Serif Display, serif', color: '#1C1612' }}
              >
                Havens
              </h1>
              <p className="text-sm max-w-[240px]" style={{ color: '#7A6B5D' }}>
                Sign in to manage your properties
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  className="block text-xs font-medium mb-1.5 tracking-wide uppercase"
                  style={{ color: '#7A6B5D' }}
                >
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@havens.in"
                  required
                  onFocus={() => setFocused('email')}
                  onBlur={() => setFocused(null)}
                  className="w-full px-3.5 py-3 rounded-xl text-sm outline-none transition-all duration-200"
                  style={{
                    background: focused === 'email' ? '#fff' : 'rgba(255,255,255,0.72)',
                    border:
                      focused === 'email'
                        ? '1px solid #2A5244'
                        : '1px solid rgba(217, 208, 197, 0.95)',
                    color: '#1C1612',
                    boxShadow:
                      focused === 'email'
                        ? '0 0 0 3px rgba(42,82,68,0.18)'
                        : 'none',
                  }}
                />
              </div>

              <div>
                <label
                  className="block text-xs font-medium mb-1.5 tracking-wide uppercase"
                  style={{ color: '#7A6B5D' }}
                >
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused(null)}
                  className="w-full px-3.5 py-3 rounded-xl text-sm outline-none transition-all duration-200"
                  style={{
                    background: focused === 'password' ? '#fff' : 'rgba(255,255,255,0.72)',
                    border:
                      focused === 'password'
                        ? '1px solid #2A5244'
                        : '1px solid rgba(217, 208, 197, 0.95)',
                    color: '#1C1612',
                    boxShadow:
                      focused === 'password'
                        ? '0 0 0 3px rgba(42,82,68,0.18)'
                        : 'none',
                  }}
                />
              </div>

              {error && (
                <div
                  className="text-sm px-3.5 py-2.5 rounded-xl"
                  style={{
                    background: '#FDECEA',
                    border: '1px solid rgba(192, 57, 43, 0.35)',
                    color: '#C0392B',
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="group relative w-full py-3 rounded-xl text-sm font-semibold overflow-hidden transition-transform duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70 disabled:hover:scale-100"
                style={{
                  background: 'linear-gradient(135deg, #2A5244 0%, #3d6b58 100%)',
                  color: '#F7F3EE',
                  boxShadow: '0 10px 28px rgba(42,82,68,0.45)',
                }}
              >
                <span
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{
                    background:
                      'linear-gradient(135deg, #3d6b58 0%, #B87333 100%)',
                  }}
                />
                <span className="relative z-10">
                  {loading ? 'Signing in…' : 'Sign in'}
                </span>
              </button>
            </form>

            {/* Demo logins */}
            <div className="mt-7 pt-6" style={{ borderTop: '1px solid rgba(217, 208, 197, 0.85)' }}>
              <p
                className="text-[10px] font-medium mb-3 tracking-[0.14em] uppercase"
                style={{ fontFamily: 'DM Mono, monospace', color: '#7A6B5D' }}
              >
                Demo logins
              </p>
              <div className="space-y-1.5">
                {USERS.map(u => (
                  <button
                    key={u.uid}
                    type="button"
                    onClick={() => {
                      setEmail(u.email);
                      setPassword(u.password ?? '');
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all duration-200 hover:bg-white"
                    style={{
                      color: '#1C1612',
                      border: '1px solid rgba(217, 208, 197, 0.95)',
                      background: 'rgba(255,255,255,0.55)',
                    }}
                  >
                    <span className="font-medium">{u.name}</span>
                    <span
                      className="text-[11px]"
                      style={{ fontFamily: 'DM Mono, monospace', color: '#7A6B5D' }}
                    >
                      {u.role === 'superadmin'
                        ? 'Super Admin'
                        : u.role === 'admin'
                          ? 'Property Owner'
                          : 'Maintenance'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <InstallAppButton variant="login" />
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-white/45">
          Boutique hospitality, thoughtfully managed.
        </p>
      </div>

      <style>{`
        @keyframes loginKenburns {
          from { transform: scale(1.05) translate(0, 0); }
          to { transform: scale(1.12) translate(-1.5%, -1%); }
        }
        @keyframes loginFadeUp {
          from { opacity: 0; transform: translateY(18px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
