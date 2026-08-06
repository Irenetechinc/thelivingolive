import { logger } from './logger.js';

const log = logger('storage');

// Per-file upload limit enforced by multer on the server side.
// We do NOT pass fileSizeLimit to createBucket because Supabase's free-tier
// API rejects the call when that field is set — the field is interpreted
// differently across plan tiers and causes "object exceeded maximum allowed
// size" errors even though 49 MB is within the 50 MB plan cap.
export const MAX_STORAGE_BYTES = 49 * 1000 * 1000;   // 49 MB — used by multer only

const bucketStates = new Map();

export async function ensurePublicBucket(supabase, name, {
  allowedMimeTypes = ['image/*', 'video/*', 'audio/*'],
} = {}) {
  if (!supabase) throw new Error('Storage is not configured');
  if (bucketStates.get(name) === true) return;

  // Check whether the bucket already exists first.
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (!listError && buckets?.some((bucket) => bucket.name === name)) {
    bucketStates.set(name, true);
    return;
  }
  if (listError) {
    log.warn(`Could not list storage buckets before ensuring ${name}: ${listError.message}`);
  }

  // Create without fileSizeLimit — Supabase uses the plan default.
  // File-size enforcement is handled by multer before any upload reaches here.
  const { error } = await supabase.storage.createBucket(name, {
    public: true,
    allowedMimeTypes,
  });

  if (!error || /already exists|duplicate|violates/i.test(error.message ?? '')) {
    bucketStates.set(name, true);
    return;
  }

  log.error(`Bucket ${name} could not be created: ${error.message}`);
  throw error;
}
