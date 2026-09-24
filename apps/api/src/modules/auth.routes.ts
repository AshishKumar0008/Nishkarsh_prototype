import { demoLoginSchema, loginSchema } from '@pragati/shared';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { HttpError } from '../core/errors';
import { prisma } from '../core/prisma';
import { currentUser, requireAuth, signToken, type AuthUser } from '../middleware/auth';

export const authRouter = Router();

const demoMode = () => process.env.DEMO_MODE === 'true';

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  departmentId: true,
  startupId: true,
  department: { select: { name: true, district: true } },
  startup: { select: { name: true } },
} as const;

function issue(user: AuthUser & Record<string, unknown>) {
  const { id, role, name, departmentId, startupId } = user;
  return { token: signToken({ id, role, name, departmentId, startupId }), user };
}

authRouter.post('/login', async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const found = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!found || !(await bcrypt.compare(password, found.passwordHash))) {
    throw new HttpError(401, 'Invalid email or password');
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: found.id }, select: userSelect });
  res.json(issue(user));
});

/** One-click role switching for demos. Disabled unless DEMO_MODE=true. */
authRouter.post('/demo-login', async (req, res) => {
  if (!demoMode()) throw new HttpError(404, 'Not found');
  const { role, email } = demoLoginSchema.parse(req.body);
  const user = await prisma.user.findFirst({
    where: email ? { email, role } : { role },
    orderBy: { email: 'asc' },
    select: userSelect,
  });
  if (!user) throw new HttpError(404, `No demo user with role ${role}`);
  res.json(issue(user));
});

authRouter.get('/demo-users', async (_req, res) => {
  if (!demoMode()) return res.json([]);
  res.json(await prisma.user.findMany({ select: userSelect, orderBy: [{ role: 'asc' }, { email: 'asc' }] }));
});

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json(await prisma.user.findUniqueOrThrow({ where: { id: currentUser(req).id }, select: userSelect }));
});
