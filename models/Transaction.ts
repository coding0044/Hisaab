import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { TRANSACTION_STATUSES, TRANSACTION_TYPES } from '../types/index.ts';

const TransactionSchema = new Schema(
  {
    sender_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    receiver_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount_paisa: { type: Number, required: true, min: 1 },
    amount_decimal: { type: Schema.Types.Decimal128, required: true },
    repaid_amount_paisa: { type: Number, required: true, default: 0, min: 0 },
    currency: { type: String, default: 'PKR', enum: ['PKR'] },
    transaction_type: { type: String, required: true, enum: TRANSACTION_TYPES },
    description: { type: String, required: true, trim: true },
    notes: { type: String, default: '', trim: true },
    transaction_date: { type: String, required: true, index: true },
    status: { type: String, required: true, enum: TRANSACTION_STATUSES, default: 'PENDING' },
    reversed_transaction_id: { type: Schema.Types.ObjectId, ref: 'Transaction', default: null },
    idempotency_key: { type: String, required: true },
    created_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approved_at: { type: Date, default: null },
    rejected_at: { type: Date, default: null },
    approved_by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    source_transaction_id: { type: Schema.Types.ObjectId, ref: 'Transaction', default: null },
  },
  {
    collection: 'transactions',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

TransactionSchema.index({ sender_id: 1, receiver_id: 1, transaction_date: -1 });
TransactionSchema.index({ transaction_date: -1 });
TransactionSchema.index({ idempotency_key: 1 }, { unique: true });

export type TransactionDoc = InferSchemaType<typeof TransactionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const TransactionModel =
  mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);
