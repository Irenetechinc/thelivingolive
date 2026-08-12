---
name: Expo on Replit workflows
description: How to get an Expo/React Native dev server running as a Replit workflow reachable from a physical phone.
---

Running Expo inside a Replit workflow for physical-device testing (not Replit's web preview):

- Metro's default port 8081 is not in Replit's supported workflow port list; use `--port 8080` (or another supported port) with `outputType: "console"`.
- `expo start --tunnel` needs `@expo/ngrok` installed; if it's missing, the CLI blocks on an interactive "install it globally?" prompt and the workflow hangs. Add `@expo/ngrok` as a devDependency in the Expo project up front.
- The tunnel gives an `exp://...exp.direct` URL usable directly in Expo Go from any network — this is separate from Replit's own dev-domain proxy.
- A separate backend (Express etc.) needs its own workflow bound to port 5000 with `outputType: "webview"` to get a publicly reachable HTTPS URL (`REPLIT_DEV_DOMAIN`) that a physical phone can call — the Expo tunnel only covers the Metro bundler, not any backend API.
