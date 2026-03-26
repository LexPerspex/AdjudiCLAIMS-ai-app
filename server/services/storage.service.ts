/**
 * Storage abstraction for document uploads.
 *
 * Supports two backends:
 *   - Google Cloud Storage (production) -- when GCS_BUCKET env var is set
 *   - Local filesystem (development)   -- writes to ./uploads/
 *
 * Path format: {orgId}/{claimId}/{docId}/{fileName}
 */

import { Storage } from '@google-cloud/storage';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * Storage backend interface for document file operations.
 *
 * Two implementations exist to support both production (GCS) and local
 * development (filesystem). The active backend is selected at module load
 * time based on the GCS_BUCKET environment variable. This abstraction
 * allows the document pipeline to work identically in both environments.
 *
 * Path format: {orgId}/{claimId}/{docId}/{fileName} — provides natural
 * tenant isolation in GCS and mirrors the claim hierarchy in the filesystem.
 */
export interface StorageService {
  /**
   * Upload a file and return its URL (gs:// for GCS) or local path.
   */
  upload(
    orgId: string,
    claimId: string,
    docId: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string>;

  /**
   * Download a file by its URL/path and return the contents.
   */
  download(fileUrl: string): Promise<Buffer>;

  /**
   * Delete a file by its URL/path.
   */
  delete(fileUrl: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function objectPath(
  orgId: string,
  claimId: string,
  docId: string,
  fileName: string,
): string {
  // Sanitize: use only the basename, reject path traversal attempts
  const sanitized = basename(fileName);
  if (sanitized !== fileName || fileName.includes('..')) {
    throw new Error('Invalid file name: path traversal detected');
  }
  return `${orgId}/${claimId}/${docId}/${sanitized}`;
}

// ---------------------------------------------------------------------------
// GCS implementation
// ---------------------------------------------------------------------------

function createGcsService(bucketName: string): StorageService {
  const storage = new Storage();
  const bucket = storage.bucket(bucketName);

  return {
    async upload(orgId, claimId, docId, fileName, buffer, mimeType) {
      const key = objectPath(orgId, claimId, docId, fileName);
      const file = bucket.file(key);
      await file.save(buffer, {
        contentType: mimeType,
        resumable: false,
      });
      return `gs://${bucketName}/${key}`;
    },

    async download(fileUrl) {
      const key = fileUrl.replace(`gs://${bucketName}/`, '');
      const [contents] = await bucket.file(key).download();
      return contents;
    },

    async delete(fileUrl) {
      const key = fileUrl.replace(`gs://${bucketName}/`, '');
      await bucket.file(key).delete();
    },
  };
}

// ---------------------------------------------------------------------------
// Local filesystem implementation
// ---------------------------------------------------------------------------

const UPLOADS_ROOT = './uploads';

function createLocalService(): StorageService {
  return {
    async upload(orgId, claimId, docId, fileName, buffer, _mimeType) {
      const relative = objectPath(orgId, claimId, docId, fileName);
      const fullPath = join(UPLOADS_ROOT, relative);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, buffer);
      return fullPath;
    },

    async download(fileUrl) {
      return readFile(fileUrl);
    },

    async delete(fileUrl) {
      await unlink(fileUrl);
    },
  };
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

const gcsBucket = process.env['GCS_BUCKET'];

export const storageService: StorageService = gcsBucket
  ? createGcsService(gcsBucket)
  : createLocalService();
