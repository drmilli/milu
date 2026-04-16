#!/usr/bin/env tsx
/**
 * Register a phone number with Africa's Talking and link it to a business.
 * Usage: pnpm tsx scripts/provision-number.ts --number +2348012345678 --business-id biz_123
 */
const args = process.argv.slice(2);
const number = args[args.indexOf('--number') + 1];
const businessId = args[args.indexOf('--business-id') + 1];

if (!number || !businessId) {
  console.error('Usage: provision-number --number <e164> --business-id <id>');
  process.exit(1);
}

console.log(`Provisioning ${number} for business ${businessId}`);
console.log('Requires AT_API_KEY, AT_USERNAME, and DATABASE_URL in environment.');
