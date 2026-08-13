const fs = require('fs').promises;
const path = require('path');

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) await walk(full);
    else if (ent.isFile() && full.endsWith('.d.ts')) await fixFile(full);
  }
}

async function fixFile(filePath) {
  try {
    const buf = await fs.readFile(filePath);
    // Heuristic: if many null bytes (UTF-16 LE/BE) then convert
    const nullCount = buf.reduce((c, b) => c + (b === 0 ? 1 : 0), 0);
    if (nullCount > buf.length * 0.4) {
      // Detect BOM
      const bom0 = buf[0];
      const bom1 = buf[1];
      let text = null;
      if (bom0 === 0xff && bom1 === 0xfe) {
        // UTF-16 LE with BOM
        text = buf.toString('utf16le').replace(/^\uFEFF/, '');
      } else if (bom0 === 0xfe && bom1 === 0xff) {
        // UTF-16 BE: swap bytes then decode as LE
        const swapped = Buffer.allocUnsafe(buf.length - 2);
        for (let i = 2, j = 0; i + 1 < buf.length; i += 2, j += 2) {
          swapped[j] = buf[i + 1];
          swapped[j + 1] = buf[i];
        }
        text = swapped.toString('utf16le');
      } else {
        // try LE without BOM
        text = buf.toString('utf16le');
      }
      // Basic sanity: must contain 'declare' or 'export' keywords
      if (text && /\bdeclare\b|\bexport\b/.test(text)) {
        await fs.writeFile(filePath, text, 'utf8');
        console.log('Converted', filePath);
      }
    }
  } catch (err) {
    console.error('Error processing', filePath, err.message);
  }
}

(async function main(){
  const base = path.resolve(__dirname, '..', 'node_modules', 'react-native');
  try {
    await walk(base);
    console.log('Done scanning react-native .d.ts files');
  } catch (err) {
    console.error('Failed', err.message);
    process.exit(1);
  }
})();
