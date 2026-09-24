import { ROLE_LABELS } from '@pragati/shared';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../lib/api';
import { HOME_BY_ROLE, useAuth } from '../lib/auth';
import type { SessionUser } from '../lib/types';

/** Demo-only: jump between seeded users. Renders nothing unless the API runs with DEMO_MODE=true. */
export default function RoleSwitcher() {
  const { user, demoLogin } = useAuth();
  const navigate = useNavigate();
  const { data: users = [] } = useQuery({
    queryKey: ['demo-users'],
    queryFn: () => api<SessionUser[]>('/auth/demo-users'),
    staleTime: Infinity,
  });
  if (!users.length || !user) return null;

  return (
    <label className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs">
      <span className="font-semibold text-amber-800">DEMO</span>
      <select
        className="bg-transparent text-xs focus:outline-none"
        value={user.email}
        onChange={async (e) => {
          const target = users.find((u) => u.email === e.target.value)!;
          const next = await demoLogin(target.role, target.email);
          navigate(HOME_BY_ROLE[next.role]);
        }}
      >
        {users.map((u) => (
          <option key={u.email} value={u.email}>
            {ROLE_LABELS[u.role]} — {u.name}
          </option>
        ))}
      </select>
    </label>
  );
}
