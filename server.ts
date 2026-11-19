import 'dotenv/config';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import {
  type AuthenticatedRequest,
  SESSION_COOKIE_NAME,
  checkLoginRateLimit,
  clearSessionCookie,
  hashPassword,
  resetLoginRateLimit,
  setSessionCookie,
  signSessionToken,
  verifyPassword,
  verifySameOriginMiddleware,
  verifySessionToken,
} from './lib/auth.ts';
import {
  createMoneyTransaction,
  approvePaymentOperation,
  rejectPaymentOperation,
  createReminderOperation,
  createRepaymentOperation,
  deleteReminderOperation,
  ensureSeeded,
  findStoredUserByEmail,
  findStoredUserById,
  getDashboardPayload,
  getLedgerAndPendingDebts,
  getMemberDetailPayload,
  getMembersDirectoryPayload,
  getReportsPayload,
  listNotificationsForUser,
  listPublicMembers,
  listRemindersForUser,
  markAllNotificationsRead,
  markNotificationRead,
  reverseTransactionOperation,
  syncDueReminderNotifications,
  updateMemberPassword,
  updateMemberPhone,
  updateReminderOperation,
} from './lib/data-store.ts';
import { isMongoConfigured } from './lib/mongodb.ts';
import {
  changePasswordSchema,
  giveMoneySchema,
  loginSchema,
  receiveMoneySchema,
  reminderCreateSchema,
  reminderUpdateSchema,
  repaymentSchema,
  reversalSchema,
  updateProfileSchema,
} from './lib/validations.ts';

async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (!token) {
      res.status(401).json({ error: 'Authentication required. Please log in.' });
      return;
    }
    const payload = verifySessionToken(token);
    if (!payload) {
      clearSessionCookie(req, res);
      res.status(401).json({ error: 'Session expired. Please log in again.' });
      return;
    }
    const user = await findStoredUserById(payload.sub);
    if (!user) {
      clearSessionCookie(req, res);
      res.status(401).json({ error: 'Account unavailable. Please log in again.' });
      return;
    }
    req.session = payload;
    req.user = {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      phone_number: user.phone_number,
      international_phone: user.international_phone,
      avatar_url: user.avatar_url,
      is_active: user.is_active,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
    next();
  } catch (err) {
    next(err);
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Seed the 3 registered members idempotently at startup
  await ensureSeeded();
  await syncDueReminderNotifications().catch(() => undefined);

  // Periodic background check for due reminders (every 60s)
  const reminderTimer = setInterval(() => {
    syncDueReminderNotifications().catch(() => undefined);
  }, 60_000);
  reminderTimer.unref();

  // Apply CSRF / origin check to /api routes
  app.use('/api', verifySameOriginMiddleware);

  // Healthcheck
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      storage: isMongoConfigured() ? 'mongodb_atlas' : 'local_persistent',
    });
  });

  // ---------------- AUTH ROUTES ----------------
  app.post('/api/auth/login', async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid login input.' });
        return;
      }

      const { email, password, rememberMe } = parsed.data;
      const rateKey = `${req.ip ?? 'unknown'}:${email}`;
      const limit = checkLoginRateLimit(rateKey);
      if (!limit.allowed) {
        res.status(429).json({
          error: `Too many login attempts. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`,
        });
        return;
      }

      const user = await findStoredUserByEmail(email);
      if (!user) {
        res.status(401).json({ error: 'Invalid email address or password.' });
        return;
      }

      const isValid = await verifyPassword(password, user.password_hash);
      if (!isValid) {
        res.status(401).json({ error: 'Invalid email address or password.' });
        return;
      }

      resetLoginRateLimit(rateKey);
      const token = signSessionToken(
        { id: user.id, email: user.email, full_name: user.full_name },
        rememberMe
      );
      setSessionCookie(req, res, token, rememberMe);

      res.json({
        user: {
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          phone_number: user.phone_number,
          international_phone: user.international_phone,
          avatar_url: user.avatar_url,
          is_active: user.is_active,
          created_at: user.created_at,
          updated_at: user.updated_at,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? 'Unable to sign in.' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, async (req: AuthenticatedRequest, res) => {
    res.json({ user: req.user });
  });

  app.put('/api/auth/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = updateProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid phone number.' });
        return;
      }
      const updated = await updateMemberPhone(req.user!.id, parsed.data.phone_number);
      res.json({ user: updated });
    } catch (err: any) {
      res.status(400).json({ error: err?.message ?? 'Could not update profile.' });
    }
  });

  app.post('/api/auth/change-password', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = changePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid password input.' });
        return;
      }
      const stored = await findStoredUserById(req.user!.id);
      if (!stored) {
        res.status(404).json({ error: 'Member account not found.' });
        return;
      }
      const matches = await verifyPassword(parsed.data.currentPassword, stored.password_hash);
      if (!matches) {
        res.status(400).json({ error: 'Current password is incorrect.' });
        return;
      }
      const newHash = await hashPassword(parsed.data.newPassword);
      await updateMemberPassword(req.user!.id, newHash);
      res.json({ ok: true, message: 'Password updated successfully.' });
    } catch (err: any) {
      res.status(400).json({ error: err?.message ?? 'Could not update password.' });
    }
  });

  // ---------------- DASHBOARD ----------------
  app.get('/api/dashboard', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const payload = await getDashboardPayload(req.user!.id);
      res.json(payload);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? 'Failed to load dashboard.' });
    }
  });

  // ---------------- MEMBERS ----------------
  app.get('/api/members', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const data = await getMembersDirectoryPayload(req.user!.id);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? 'Failed to load members.' });
    }
  });

  app.get('/api/members/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const memberId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const data = await getMemberDetailPayload(req.user!.id, memberId);
      res.json(data);
    } catch (err: any) {
      res.status(400).json({ error: err?.message ?? 'Failed to load member details.' });
    }
  });

  // ---------------- TRANSACTIONS ----------------
  app.get('/api/transactions', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const data = await getLedgerAndPendingDebts(req.user!.id);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? 'Failed to load transactions.' });
    }
  });

  app.post('/api/transactions/give', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = giveMoneySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid give money input.' });
        return;
      }

      const tx = await createMoneyTransaction({
        actorUserId: req.user!.id,
        senderId: req.user!.id,
        receiverId: parsed.data.receiver_id,
        amountInput: parsed.data.amount,
        transactionType: 'MONEY_GIVEN',
        transactionDate: parsed.data.transaction_date,
        description: parsed.data.description,
        notes: parsed.data.notes,
        idempotencyKey: parsed.data.idempotency_key,
      });

      res.status(201).json({ transaction: tx });
    } catch (err: any) {
      res.status(400).json({ error: err?.message ?? 'Could not record transaction.' });
    }
  });

  app.post('/api/transactions/receive', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = receiveMoneySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid receive money input.' });
        return;
      }

      if (parsed.data.is_repayment) {
        // Route strictly through the repayment system so we never double-count
        const repaymentResult = await createRepaymentOperation({
          actorUserId: req.user!.id,
          payerId: parsed.data.sender_id,
          receiverId: req.user!.id,
          transactionId: parsed.data.transaction_id,
          allocationMode: parsed.data.transaction_id ? 'SPECIFIC' : 'FIFO',
          amountInput: parsed.data.amount,
          repaymentDate: parsed.data.transaction_date,
          paymentMethod: parsed.data.payment_method,
          description: parsed.data.description,
          idempotencyKey: parsed.data.idempotency_key,
        });
        res.status(201).json({ mode: 'REPAYMENT', ...repaymentResult });
        return;
      }

      const tx = await createMoneyTransaction({
        actorUserId: req.user!.id,
        senderId: parsed.data.sender_id,
        receiverId: req.user!.id,
        amountInput: parsed.data.amount,
        transactionType: 'MONEY_RECEIVED',
        transactionDate: parsed.data.transaction_date,
        description: parsed.data.description,
        notes: parsed.data.notes,
        idempotencyKey: parsed.data.idempotency_key,
      });

      res.status(201).json({ mode: 'LOAN_RECEIVED', transaction: tx });
    } catch (err: any) {
      res.status(400).json({ error: err?.message ?? 'Could not record money received.' });
    }
  });

  app.post('/api/transactions/:id/approve', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const transactionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const transaction = await approvePaymentOperation({
        actorUserId: req.user!.id,
        transactionId,
      });
      res.json({ transaction });
    } catch (err: any) {
      res.status(400).json({ error: err?.message ?? 'Could not approve payment.' });
    }
  });

  app.post('/api/transactions/:id/reject', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const transactionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const transaction = await rejectPaymentOperation({
        actorUserId: req.user!.id,
        transactionId,
      });
      res.json({ transaction });
    } catch (err: any) {
      res.status(400).json({ error: err?.message ?? 'Could not reject payment.' });
    }
  });

  app.post('/api/transactions/:id/reverse', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const transactionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const parsed = reversalSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid reversal request.' });
        return;
      }
      const reversal = await reverseTransactionOperation({
        actorUserId: req.user!.id,
        transactionId,
        reason: parsed.data.reason,
        idempotencyKey: parsed.data.idempotency_key,
      });
      res.status(201).json({ reversal });
    } catch (err: any) {
      res.status(400).json({ error: err?.message ?? 'Could not reverse transaction.' });
    }
  });

  // ---------------- REPAYMENTS ----------------
  app.get('/api/repayments', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const data = await getLedgerAndPendingDebts(req.user!.id);
      res.json({
        members: data.members,
        repayments: data.repayments,
        my_payables: data.my_payables,
        directional_balances: data.directional_balances,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? 'Failed to load repayments.' });
    }
  });

  app.post('/api/repayments', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = repaymentSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid repayment input.' });
        return;
      }

      const result = await createRepaymentOperation({
        actorUserId: req.user!.id,
        payerId: req.user!.id,
        receiverId: parsed.data.receiver_id,
        transactionId: parsed.data.transaction_id,
        allocationMode: parsed.data.allocation_mode,
        amountInput: parsed.data.amount,
        repaymentDate: parsed.data.repayment_date,
        paymentMethod: parsed.data.payment_method,
        description: parsed.data.description,
        idempotencyKey: parsed.data.idempotency_key,
      });

      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err?.message ?? 'Could not process repayment.' });
    }
  });

  // ---------------- REMINDERS ----------------
  app.get('/api/reminders', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const [reminders, members] = await Promise.all([
        listRemindersForUser(req.user!.id),
        listPublicMembers(),
      ]);
      res.json({ reminders, members });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? 'Failed to load reminders.' });
    }
  });

  app.post('/api/reminders', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = reminderCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid reminder input.' });
        return;
      }

      const reminder = await createReminderOperation({
        actorUserId: req.user!.id,
        recipientId: parsed.data.recipient_id,
        title: parsed.data.title,
        amountInput: parsed.data.amount,
        reminderDate: parsed.data.reminder_date,
        reminderTime: parsed.data.reminder_time,
        description: parsed.data.description,
      });
      res.status(201).json({ reminder });
    } catch (err: any) {
      res.status(400).json({ error: err?.message ?? 'Could not create reminder.' });
    }
  });

  app.patch('/api/reminders/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const reminderId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const parsed = reminderUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid reminder update.' });
        return;
      }
      const reminder = await updateReminderOperation({
        actorUserId: req.user!.id,
        reminderId,
        updates: parsed.data,
      });
      res.json({ reminder });
    } catch (err: any) {
      res.status(400).json({ error: err?.message ?? 'Could not update reminder.' });
    }
  });

  app.delete('/api/reminders/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const reminderId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      await deleteReminderOperation({
        actorUserId: req.user!.id,
        reminderId,
      });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err?.message ?? 'Could not delete reminder.' });
    }
  });

  // ---------------- REPORTS ----------------
  app.get('/api/reports', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const data = await getReportsPayload(req.user!.id);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? 'Failed to load financial reports.' });
    }
  });

  // ---------------- NOTIFICATIONS ----------------
  app.get('/api/notifications', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      await syncDueReminderNotifications();
      const notifications = await listNotificationsForUser(req.user!.id);
      res.json({
        notifications,
        unread_count: notifications.filter((n) => !n.is_read).length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? 'Failed to load notifications.' });
    }
  });

  app.post('/api/notifications/read-all', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      await markAllNotificationsRead(req.user!.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? 'Could not mark notifications read.' });
    }
  });

  app.post('/api/notifications/:id/read', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const notificationId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      await markNotificationRead(req.user!.id, notificationId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err?.message ?? 'Could not update notification.' });
    }
  });

  // ---------------- VITE / STATIC SERVING ----------------
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.use((err: any, _req: express.Request, res: Response, _next: NextFunction) => {
    console.error('Server error:', err);
    res.status(500).json({ error: err?.message ?? 'Internal server error.' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Friends Hisaab server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal startup failure:', err);
  process.exit(1);
});
