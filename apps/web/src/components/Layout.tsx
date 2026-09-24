import { ROLE_LABELS } from '@pragati/shared';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { HOME_BY_ROLE, useAuth } from '../lib/auth';
import RoleSwitcher from './RoleSwitcher';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <NavLink to={HOME_BY_ROLE[user.role]} className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-indigo-800">PraGaTi Setu</span>
            <span className="hidden text-xs text-slate-500 sm:inline">Pilot-to-procurement pathway · Govt. of Maharashtra</span>
          </NavLink>
          <div className="flex flex-wrap items-center gap-3">
            <RoleSwitcher />
            <div className="text-right text-sm leading-tight">
              <div className="font-medium">{user.name}</div>
              <div className="text-xs text-slate-500">
                {ROLE_LABELS[user.role]}
                {user.department && ` · ${user.department.district}`}
                {user.startup && ` · ${user.startup.name}`}
              </div>
            </div>
            <button
              className="btn-secondary px-3 py-1.5"
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
