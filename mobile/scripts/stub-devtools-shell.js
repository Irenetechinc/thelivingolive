// The @react-native/debugger-shell package ships a DotSlash pointer file that
// lazily downloads a ~115-235MB "React Native DevTools" binary on first use.
// In this container that binary can't run anyway (missing libglib-2.0), and
// worse: when EAS Build's local project-preparation step triggers this fetch
// inside its ephemeral shallow-clone temp dir, DotSlash caches the artifact
// in a read-only directory that EAS's own cleanup can't remove, permanently
// failing `eas build` with an EACCES/rmdir error.
//
// We replace the DotSlash pointer with a harmless no-op stub so nothing ever
// triggers that fetch. This only disables the optional "open Chrome DevTools
// debugger" dev feature; it has no effect on bundling or building the app.
const fs = require("fs");
const path = require("path");

const target = path.join(
  __dirname,
  "..",
  "node_modules",
  "@react-native",
  "debugger-shell",
  "bin",
  "react-native-devtools",
);

if (fs.existsSync(target)) {
  fs.writeFileSync(target, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  console.log("[stub-devtools-shell] neutralized react-native-devtools dotslash pointer");
}
