#!/usr/bin/env node
// Compares Wails-generated JS bindings (authoritative arg counts) against
// the custom TypeScript wrappers to catch argument mismatches at build time.

const fs = require('fs');
const path = require('path');

const generatedDir = path.join(__dirname, '..', 'ui', 'wailsjs', 'go', 'handlers');
const customDir = path.join(__dirname, '..', 'ui', 'src', 'wailsjs', 'go', 'handlers');

// Parse "export function Foo(arg1, arg2, ...)" from generated JS
function parseGeneratedJS(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const fns = {};
  const re = /export function (\w+)\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const name = m[1];
    const params = m[2].trim();
    fns[name] = params === '' ? 0 : params.split(',').length;
  }
  return fns;
}

// Parse wailsCall(...) arg counts from custom TS wrappers.
// wailsCall(handler, method, ...rest) — rest.length should equal the generated arg count.
function parseCustomTS(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const fns = {};
  const re = /export function (\w+)\b[^{]*\{[^}]*wailsCall\([^,]+,\s*'(\w+)'((?:,\s*[^)]+?)?)\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const methodName = m[2];
    const argsStr = m[3].trim();
    if (argsStr === '') {
      fns[methodName] = 0;
    } else {
      const cleaned = argsStr.replace(/^,\s*/, '');
      fns[methodName] = cleaned.split(',').length;
    }
  }
  return fns;
}

let errors = 0;
let checked = 0;

const jsFiles = fs.readdirSync(generatedDir).filter(f => f.endsWith('.js'));

for (const jsFile of jsFiles) {
  const handler = jsFile.replace('.js', '');
  const tsFile = handler + '.ts';
  const tsPath = path.join(customDir, tsFile);

  if (!fs.existsSync(tsPath)) continue;

  const generated = parseGeneratedJS(path.join(generatedDir, jsFile));
  const custom = parseCustomTS(tsPath);

  for (const [fnName, expectedArgs] of Object.entries(generated)) {
    if (!(fnName in custom)) continue; // TS doesn't wrap this function, skip
    checked++;
    const actualArgs = custom[fnName];
    if (actualArgs !== expectedArgs) {
      console.error(
        `MISMATCH ${handler}.${fnName}: TS wrapper passes ${actualArgs} args, Wails binding expects ${expectedArgs}`
      );
      errors++;
    }
  }
}

if (errors > 0) {
  console.error(`\n${errors} binding mismatch(es) found across ${checked} functions checked.`);
  process.exit(1);
} else {
  console.log(`All ${checked} Wails binding arg counts match.`);
}
