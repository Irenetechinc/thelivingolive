---
name: Normalize MIME types before upload on Android
description: Android expo-image-picker returns non-standard MIME types that fail server allowlist checks; normalize client-side.
---

## Rule
Always normalize MIME types reported by `expo-image-picker` before passing them to the upload API. Map all video assets to `video/mp4` and treat any unknown image MIME as `image/jpeg`.

## Why
On Android, `expo-image-picker` returns the actual OS-reported MIME type from the media store, which can be:
- Videos: `video/3gpp`, `video/3gpp2`, `video/x-matroska`, `video/mpeg`, `video/avi`, `video/x-ms-wmv`
- Images: `image/heic`, `image/heif`, `image/webp`, or sometimes `application/octet-stream`

The server's multer `fileFilter` allowlist rejects unrecognized types with a 400 JSON error, which the client catches as "Could not create post".

## How to apply
```typescript
const rawMime: string = (asset as any).mimeType ?? '';
const mime = asset.type === 'video'
  ? 'video/mp4'
  : (rawMime.startsWith('image/') ? rawMime : 'image/jpeg');
```

The server still stores the file with the original extension from `originalname`, so heic/heif images are stored correctly — only the `Content-Type` header used by multer's filter is normalized.

## Files
- `mobile/src/screens/community/OliveChatScreen.tsx` — `pickMedia()` function in `CreatePostModal`
- `server/src/routes/community.js` — `ALLOWED_POST_TYPES` and `ALLOWED_IMAGE_TYPES` sets
