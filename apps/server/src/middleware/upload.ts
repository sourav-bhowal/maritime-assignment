import multer from "multer";

/**
 * Multer config for file uploads.
 * Stores files in memory (Buffer) — no disk persistence.
 * Max file size: 10MB.
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});
