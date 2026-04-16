#!/usr/bin/env tsx
/**
 * Simulate a full STT → LLM → TTS call pipeline locally.
 * Usage: pnpm --filter @milu/api simulate-call --business-id biz_123 --audio ./test/fixtures/sample-call.wav
 */
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const businessId = args[args.indexOf('--business-id') + 1];
const audioPath = args[args.indexOf('--audio') + 1];

if (!businessId || !audioPath) {
  console.error('Usage: simulate-call --business-id <id> --audio <path>');
  process.exit(1);
}

console.log(`Simulating call for business: ${businessId}`);
console.log(`Audio input: ${audioPath}`);
console.log('Pipeline: STT → LLM → TTS');
console.log('(Connect to a running API server and database to run a live simulation)');
