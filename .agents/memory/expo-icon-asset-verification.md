---
name: Expo icon/splash asset verification
description: Why app.json referencing a valid PNG isn't enough — actually view the rendered image before trusting it as a production icon/splash asset.
---

Checking that an icon/splash file referenced in `app.json` exists and has the right
dimensions/color-mode is not sufficient. In this project, `android-icon-background.png`
(wired as the Android adaptive-icon `backgroundImage`) was actually a leftover design-tool
wireframe/guide image (safe-zone circles and grid lines on a pale blue background), not a
finished asset — it would have rendered as a visibly broken icon on real Android devices.
There was also an unused stray duplicate (`android-icon-background_2.png`) never wired up.

Separately, `android-icon-monochrome.png` (Android 13+ themed/monochrome icon) had an opaque
black background baked into the PNG instead of a transparent one — Android composites its own
themed background behind the monochrome layer, so a baked-in black square shows as a visible
black box behind the icon.

**Why:** These defects were invisible to `expo-doctor`, `tsc`, and code review — they only show
up if you actually open/view the image file. A user's "the app doesn't look right on my phone" or
"there's no proper logo" report can be a real asset bug, not a code bug.

**How to apply:** When investigating icon/splash/notification-icon issues (or generally trusting
any binary asset wired into config), use the image-reading tool to actually view every asset
referenced in `app.json` before ruling out the "logo is broken" hypothesis. For Android adaptive
icons, the background layer should be a flat opaque color/image with no design-tool artifacts;
the monochrome layer must be a white silhouette on a *transparent* background (let the OS supply
the background). The notification icon (`expo-notifications` plugin `icon` option) must also be a
flat white silhouette on transparent, not the full-color app icon — Android renders it as a
solid-white blob otherwise.
