import mongoose from 'mongoose';

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

const globalForMongoose = globalThis as unknown as { __mongooseCache?: MongooseCache };
const cached: MongooseCache = globalForMongoose.__mongooseCache ?? { conn: null, promise: null };
globalForMongoose.__mongooseCache = cached;

export function isMongoConfigured(): boolean {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) return false;
  if (uri.includes('<DB_PASSWORD>') || uri.includes('MY_MONGODB_URI')) return false;
  return uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://');
}

export async function connectToDatabase(): Promise<typeof mongoose | null> {
  if (!isMongoConfigured()) {
    return null;
  }

  if (cached.conn) {
    return cached.conn;
  }

  const uri = process.env.MONGODB_URI!.trim();
  const dbName = process.env.DATABASE_NAME?.trim() || 'friends_hisaab';

  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, {
      dbName,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8000,
    });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (err) {
    cached.promise = null;
    throw err;
  }
}

export function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id) && /^[a-fA-F0-9]{24}$/.test(id);
}

export function createObjectIdString(): string {
  return new mongoose.Types.ObjectId().toHexString();
}

export function paisaToDecimal128(paisa: number): mongoose.Types.Decimal128 {
  const whole = Math.trunc(paisa / 100);
  const rem = Math.abs(paisa % 100);
  return mongoose.Types.Decimal128.fromString(`${whole}.${String(rem).padStart(2, '0')}`);
}
