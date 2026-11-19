import { z } from 'zod';
import { PAYMENT_METHODS } from '../types/index.ts';

export const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, 'Invalid member or record identifier.');

export const pkrAmountSchema = z
  .union([z.number(), z.string()])
  .transform((val) => String(val).trim().replace(/,/g, ''))
  .refine((val) => /^\d+(\.\d{1,2})?$/.test(val), {
    message: 'Enter a valid PKR amount (up to 2 decimal places).',
  })
  .refine((val) => Number.parseFloat(val) > 0, {
    message: 'Amount must be greater than Rs. 0.',
  })
  .refine((val) => Number.parseFloat(val) <= 100000000, {
    message: 'Amount exceeds single-transaction limit.',
  });

export const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format.');

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.').toLowerCase(),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
  rememberMe: z.boolean().optional().default(false),
});

export const updateProfileSchema = z.object({
  phone_number: z
    .string()
    .trim()
    .min(10, 'Phone number must be at least 10 digits.')
    .max(20, 'Phone number is too long.')
    .regex(/^[0-9+\s-]+$/, 'Enter a valid Pakistani phone number.'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters.')
    .max(128, 'Password is too long.'),
  confirmPassword: z.string().min(1, 'Please confirm your new password.'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'New password and confirmation do not match.',
  path: ['confirmPassword'],
});

export const giveMoneySchema = z.object({
  receiver_id: objectIdSchema,
  amount: pkrAmountSchema,
  transaction_date: isoDateSchema,
  description: z.string().trim().min(2, 'Description is required.').max(240),
  notes: z.string().trim().max(500).optional().default(''),
  idempotency_key: z.string().trim().min(8).max(120),
});

export const receiveMoneySchema = z.object({
  sender_id: objectIdSchema,
  amount: pkrAmountSchema,
  transaction_date: isoDateSchema,
  description: z.string().trim().min(2, 'Description is required.').max(240),
  notes: z.string().trim().max(500).optional().default(''),
  is_repayment: z.boolean(),
  transaction_id: objectIdSchema.optional(),
  payment_method: z.enum(PAYMENT_METHODS).optional().default('Cash'),
  idempotency_key: z.string().trim().min(8).max(120),
});

export const repaymentSchema = z.object({
  receiver_id: objectIdSchema,
  transaction_id: objectIdSchema.optional(),
  allocation_mode: z.enum(['SPECIFIC', 'FIFO']).default('FIFO'),
  amount: pkrAmountSchema,
  repayment_date: isoDateSchema,
  payment_method: z.enum(PAYMENT_METHODS),
  description: z.string().trim().min(2, 'Description is required.').max(240),
  idempotency_key: z.string().trim().min(8).max(120),
});

export const reversalSchema = z.object({
  reason: z.string().trim().min(3, 'Provide a brief reason for reversing this entry.').max(240),
  idempotency_key: z.string().trim().min(8).max(120),
});

export const reminderCreateSchema = z.object({
  recipient_id: objectIdSchema,
  title: z.string().trim().min(2, 'Title is required.').max(140),
  amount: pkrAmountSchema,
  reminder_date: isoDateSchema,
  reminder_time: z
    .string()
    .trim()
    .regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format.'),
  description: z.string().trim().max(400).optional().default(''),
});

export const reminderUpdateSchema = z.object({
  recipient_id: objectIdSchema.optional(),
  title: z.string().trim().min(2).max(140).optional(),
  amount: pkrAmountSchema.optional(),
  reminder_date: isoDateSchema.optional(),
  reminder_time: z
    .string()
    .trim()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  description: z.string().trim().max(400).optional(),
  status: z.enum(['PENDING', 'COMPLETED']).optional(),
});
