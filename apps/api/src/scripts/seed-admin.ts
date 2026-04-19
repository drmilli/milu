import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, users } from '../db';

const EMAIL = 'admin@miluai.app';
const PASSWORD = 'Admin123@2026';

async function main() {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL)).limit(1);

  if (existing.length) {
    const hashed = await bcrypt.hash(PASSWORD, 10);
    await db.update(users).set({ password: hashed, role: 'ADMIN', businessId: null, emailVerified: true }).where(eq(users.email, EMAIL));
    console.log('✓ Admin password updated:', EMAIL);
  } else {
    const hashed = await bcrypt.hash(PASSWORD, 10);
    await db.insert(users).values({
      email: EMAIL,
      password: hashed,
      role: 'ADMIN',
      businessId: null,
      emailVerified: true,
      firstName: 'Milu',
      lastName: 'Admin',
    });
    console.log('✓ Admin user created:', EMAIL);
  }

  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
