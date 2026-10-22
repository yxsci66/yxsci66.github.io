import { verifyOutput } from './audit.ts';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
if (!process.argv[2]) throw new Error('Static release path required');
await verifyOutput(process.argv[2]);
if (process.argv[3] === '--strip-manifest') await unlink(path.join(path.resolve(process.argv[2]), 'release-manifest.json'));
console.log('Static release bytes and allowed paths verified.');
