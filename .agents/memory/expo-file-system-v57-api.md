---
name: Expo SDK 57 file-system API
description: expo-file-system v57 replaced the old function-based API with File/Directory/Paths classes — old code snippets will fail tsc.
---

`expo-file-system` at SDK 57 has no `FileSystem.documentDirectory`, `getInfoAsync`, `makeDirectoryAsync`,
`copyAsync`, or `deleteAsync` exports anymore. Those are legacy-only now (importable from
`expo-file-system/legacy` if truly needed, but prefer the new API).

The new shape is class-based:
- `Paths.document` / `Paths.cache` — `Directory` instances for standard locations.
- `new Directory(Paths.document, "subdir")` — construct a path; `.exists` (property), `.create({ intermediates, idempotent })`.
- `new File(dir, "name.ext")` or `new File(existingUri)` — construct a file reference; `.exists`, `.copy(destFile)`, `.delete()`, `.uri`.

**Why:** training data and most tutorials online still show the pre-v52 function API; writing that against
an SDK 57 project fails at `tsc --noEmit` with "does not exist on type" errors.

**How to apply:** before writing any expo-file-system code, check the installed version
(`cat node_modules/expo-file-system/package.json`) and grep `node_modules/expo-file-system/build/*.d.ts` for
the actual exported shape rather than assuming the old function-based API.
