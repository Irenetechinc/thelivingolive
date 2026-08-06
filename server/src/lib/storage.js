import { logger } from './logger.js';

const log = logger('storage');

// Supabase projects with a 50 MB storage cap reject a bucket configured at
// exactly 50 MB. Keep both the request limit and bucket limit below that cap.
export const MAX_STORAGE_BYTES = 49 * 1000 * 1000;

const bucketStates = new Map();

export async function ensurePublicBucket(supabase, name, {
  allowedMimeTypes = ['image/*', 'video/*', 'audio/*'],
} = {}) {
  if (!supabase) throw new Error('Storage is not configured');
  if (bucketStates.get(name) === true) return;

  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (!listError && buckets?.some((bucket) => bucket.name === name)) {
    bucketStates.set(name, true);
    return;
  }
  if (listError) {
    log.warn(`Could not list storage buckets before ensuring ${name}: ${listError.message}`);
  }

  const { error } = await supabase.storage.createBucket(name, {
    public: true,
    fileSizeLimit: MAX_STORAGE_BYTES,
    allowedMimeTypes,
  });

  if (!error || /already exists|duplicate|violates/i.test(error.message ?? '')) {
    bucketStates.set(name, true);
    return;
  }

  log.error(`Bucket ${name} could not be created: ${error.message}`);
  throw error;
}