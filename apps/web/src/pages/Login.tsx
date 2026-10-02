import { ROLE_LABELS, type Role } from '@nishkarsh/shared';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { ErrorBox } from '../components/Field';
import { api } from '../lib/api';
import { HOME_BY_ROLE, useAuth } from '../lib/auth';
import type { SessionUser } from '../lib/types';

export default function Login() {
  const { user, login, demoLogin } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const { data: demoUsers = [] } = useQuery({ queryKey: ['demo-users'], queryFn: () => api<SessionUser[]>('/auth/demo-users') });

  if (user) return <Navigate to={HOME_BY_ROLE[user.role]} replace />;

  const go = async (p: Promise<SessionUser>) => {
    setError(null);
    try {
      navigate(HOME_BY_ROLE[(await p).role]);
    } catch (e) {
      setError(e);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    go(login(email, password));
  };

  return (
    <div className="mx-auto grid min-h-screen max-w-5xl items-center gap-8 px-4 py-10 md:grid-cols-2">
      <div>
        <h1 className="text-3xl font-bold text-indigo-800">Nishkarsh</h1>
        <p className="mt-3 text-slate-600">
          A standing pathway from a department's operational problem to an independently verified pilot and an
          audit-ready scale-up decision under GFR 173(i).
        </p>
        <form onSubmit={submit} className="card mt-6 space-y-4">
          <h2 className="h2">Sign in</h2>
          <ErrorBox error={error} />
          <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button className="btn-primary w-full">Sign in</button>
        </form>
      </div>

      {demoUsers.length > 0 && (
        <div className="card">
          <h2 className="h2">Demo: sign in as…</h2>
          <p className="muted mb-4">Seeded accounts (password <code>demo1234</code>). One click, no typing — for the live demo.</p>
          <ul className="divide-y divide-slate-100">
            {demoUsers.map((u) => (
              <li key={u.email}>
                <button
                  className="flex w-full items-center justify-between gap-3 px-2 py-2.5 text-left hover:bg-slate-50"
                  onClick={() => go(demoLogin(u.role as Role, u.email))}
                >
                  <span>
                    <span className="block text-sm font-medium">{u.name}</span>
                    <span className="block text-xs text-slate-500">{u.department?.name ?? u.startup?.name ?? u.email}</span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-indigo-700">{ROLE_LABELS[u.role]}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
