import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const UserSchema = new Schema(
  {
    full_name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password_hash: { type: String, required: true },
    phone_number: { type: String, required: true, trim: true },
    international_phone: { type: String, required: true, trim: true },
    avatar_url: { type: String, default: '' },
    is_active: { type: Boolean, default: true },
    available_balance_paisa: { type: Number, default: 100000000, min: 0 },
    fund_sources: {
      type: [
        {
          source_transaction_id: { type: String, required: true },
          original_sender_id: { type: String, required: true },
          remaining_paisa: { type: Number, required: true, min: 0 },
        },
      ],
      default: [],
    },
  },
  {
    collection: 'users',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

UserSchema.index({ email: 1 }, { unique: true });

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: mongoose.Types.ObjectId };

export const UserModel = mongoose.models.User || mongoose.model('User', UserSchema);
