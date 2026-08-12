---
name: React Native ghost-touch prevention — use useRef not useState for cooldown flags
description: Why useState-based cooldown flags fail to block ghost-touches from Android keyboard layout reflow, and how to fix it.
---

## Rule
Use `useRef` (not `useState`) for any flag that must synchronously block a touch handler to prevent ghost-touches immediately after a user action.

## Why
`useState` updates are batched and committed asynchronously. When the user taps "Send" and the keyboard layout reflows (even slightly, e.g. from a multiline input shrinking), a ghost-touch can fire on a newly visible element in the same event loop tick — before React has committed the `setCooldown(true)` update. The handler checks the stale `false` value and the like/action fires.

`useRef.current` is set synchronously within the same tick. Checking `ref.current` in the handler always sees the most recent value regardless of render cycles.

## How to apply
```tsx
const cooldownRef = useRef(false);

// In the action that triggers cooldown:
cooldownRef.current = true;
setTimeout(() => { cooldownRef.current = false; }, 1200); // 1200ms covers slow devices

// In the protected handler:
if (cooldownRef.current) return;
```

The `disabled` prop on a button can remain state-based (visual only). The ref check in the handler is the actual guard.

## Context
Discovered in OliveChatScreen.tsx CommentsSheet — comments were auto-liked immediately after posting because the ghost-touch from keyboard reflow fired on the heart icon of the newly appended comment before `setLikeCooldown(true)` had committed.
