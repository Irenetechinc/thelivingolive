---
name: Android keyboard behavior for React Native inputs
description: KeyboardAvoidingView behavior that actually works on Android — and why "height" fails for bottom-pinned inputs.
---

## Rule
Always use `behavior="padding"` on both iOS and Android for `KeyboardAvoidingView`. Never use `behavior="height"` on Android for screens with bottom-pinned inputs.

## Why
`behavior="height"` shrinks the container's height when the keyboard appears, but does NOT push the content up. For a bottom-pinned input bar (CommentsSheet, ChatRoom, post modals), the input ends up underneath the keyboard.

`behavior={Platform.OS === 'ios' ? 'padding' : undefined}` — the `undefined` case disables avoidance entirely on Android (bug in CreatePostModal prior to fix).

## How to apply
- **Modals** (CommentsSheet, CreatePostModal, BulletinCommentsModal): `behavior="padding"` + `keyboardVerticalOffset={Platform.OS === 'android' ? 24 : 0}` (status-bar offset)
- **Navigation screens with headers** (ChatRoomScreen): `behavior="padding"` + `keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 80}` (header + status bar)
- The `paddingBottom: insets.bottom` on the input row is still required to clear the Android gesture/3-button nav bar.
