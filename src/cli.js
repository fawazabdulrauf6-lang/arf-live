// Minimal CLI client for headless devices (a Pi, a server, a watch).
// Talks to the broker over the same token-gated API the web UI uses.
//
//   ARF_TOKEN=... node src/cli.js "turn on the kitchen light"
//   ARF_TOKEN=... node src/cli.js --lang es-ES "hola"
//   ARF_TOKEN=... node src/cli.js --interactive

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const base = process.env.ARF_URL || 'http://127.0.0.1:8787';
const token = process.env.ARF_TOKEN || '';

async function ask(text, lang = 'en-US') {
  if (!token) {
    console.error('Set ARF_TOKEN to the pairing token printed by the server.');
    process.exit(2);
  }
  const res = await fetch(`${base}/api/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text, lang }),
  });
  const data = await res.json();
  if (!res.ok) { console.error('Error:', data.error); process.exit(1); }
  console.log(`${data.denied ? '[denied] ' : ''}${data.text}`);
  if (data.requiresConfirmation && data.token) {
    console.log(`Confirmation token: ${data.token}`);
  }
  return data;
}

const args = process.argv.slice(2);
let lang = 'en-US';
let interactive = false;
const words = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--lang') { lang = args[++i]; }
  else if (args[i] === '--interactive' || args[i] === '-i') { interactive = true; }
  else words.push(args[i]);
}

if (interactive) {
  const rl = createInterface({ input: stdin, output: stdout });
  console.log('ARF interactive. Ctrl+C to exit.');
  while (true) {
    const line = (await rl.question('> ')).trim();
    if (!line) continue;
    if (line === 'exit' || line === 'quit') break;
    await ask(line, lang);
  }
  rl.close();
} else if (words.length) {
  await ask(words.join(' '), lang);
} else {
  console.log('Usage: node src/cli.js [--lang <tag>] <command>');
  console.log('       node src/cli.js --interactive');
}
