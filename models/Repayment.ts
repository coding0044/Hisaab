import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { PAYMENT_METHODS } from '../types/index.ts';

const RepaymentSchema = new Schema(
  {
    transaction_id: { type: Schema.Types.ObjectId, ref: 'Transaction', required: true, index: true },
    payer_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    receiver_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount_paisa: { type: Number, required: true, min: 1 },
    amount_decimal: { type: Schema.Types.Decimal128, required: true },
    repayment_date: { type: String, required: true, index: true },
    payment_method: { type: String, required: true, enum: PAYMENT_METHODS },
    description: { type: String, required: true, trim: true },
    receipt_number: { type: String, required: true },
    is_reversed: { type: Boolean, default: false },
    idempotency_key: { type: String, required: true },
    created_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    collection: 'repayments',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

RepaymentSchema.index({ transaction_id: 1, repayment_date: -1 });
RepaymentSchema.index({ payer_id: 1, receiver_id: 1 });
RepaymentSchema.index({ idempotency_key: 1 }, { unique: true });

export type RepaymentDoc = InferSchemaType<typeof RepaymentSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const RepaymentModel =
  mongoose.models.Repayment || mongoose.model('Repayment', RepaymentSchema);
