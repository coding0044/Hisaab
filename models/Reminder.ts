import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const ReminderSchema = new Schema(
  {
    created_by: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recipient_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    amount_paisa: { type: Number, required: true, min: 1 },
    amount_decimal: { type: Schema.Types.Decimal128, required: true },
    reminder_date: { type: String, required: true, index: true },
    reminder_time: { type: String, required: true },
    description: { type: String, default: '', trim: true },
    status: { type: String, enum: ['PENDING', 'COMPLETED'], default: 'PENDING' },
    completed_at: { type: Date, default: null },
    notified_overdue: { type: Boolean, default: false },
  },
  {
    collection: 'reminders',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

ReminderSchema.index({ reminder_date: 1, reminder_time: 1 });
ReminderSchema.index({ created_by: 1, recipient_id: 1 });

export type ReminderDoc = InferSchemaType<typeof ReminderSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ReminderModel =
  mongoose.models.Reminder || mongoose.model('Reminder', ReminderSchema);
