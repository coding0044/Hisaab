import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { NOTIFICATION_TYPES } from '../types/index.ts';

const NotificationSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    notification_type: { type: String, required: true, enum: NOTIFICATION_TYPES },
    is_read: { type: Boolean, default: false },
    related_entity_id: { type: String, default: null },
  },
  {
    collection: 'notifications',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

NotificationSchema.index({ user_id: 1, is_read: 1, created_at: -1 });

export type NotificationDoc = InferSchemaType<typeof NotificationSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const NotificationModel =
  mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
