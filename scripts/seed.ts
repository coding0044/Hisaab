import 'dotenv/config';
import { ensureSeeded } from '../lib/data-store.ts';
import { connectToDatabase, isMongoConfigured } from '../lib/mongodb.ts';

async function main() {
  console.log('Friends Hisaab — Running idempotent database seed...');

  if (isMongoConfigured()) {
    await connectToDatabase();
    console.log('Connected to MongoDB Atlas.');
  } else {
    console.log('MONGODB_URI not configured; seeding local persistent store (.data/friends_hisaab.json).');
  }

  const members = await ensureSeeded();
  console.log(`Verified ${members.length} registered members:`);
  for (const m of members) {
    console.log(` - ${m.full_name} <${m.email}> (${m.phone_number})`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
