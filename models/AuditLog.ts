import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const AuditLogSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true, trim: true },
    entity_type: { type: String, required: true, trim: true },
    entity_id: { type: String, required: true, index: true },
    details: { type: String, default: '' },
  },
  {
    collection: 'audit_logs',
    timestamps: { createdAt: 'created_at', updatedAt: false },
  }
);

AuditLogSchema.index({ user_id: 1, created_at: -1 });

export type AuditLogDoc = InferSchemaType<typeof AuditLogSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const AuditLogModel =
  mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);
