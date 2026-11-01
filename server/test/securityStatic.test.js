import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { decryptSecret, encryptSecret } from '../src/lib/secretBox.js';
import { generateToken, hashToken } from '../src/lib/resetToken.js';
import { validateRuntimeConfig } from '../src/lib/runtimeConfig.js';

// Static and cryptographic security checks: what is in the repository, its
// history and the built bundle; the primitives that protect secrets and tokens;
// production configuration; and tripwires that force a human look whenever a
// risky code pattern appears. No server, no database.

const SERVER = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(SERVER, '..');
const git = (...args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const trackedFiles = () => git('ls-files', '-z').split('\0').filter(Boolean);
const isText = (path) => !/\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|otf|mp4|mov|zip|gz|lock|lockb)$/i.test(path) && !/package-lock\.json$/.test(path);

// Credential shapes, deliberately specific to keep noise down.
const SECRET_PATTERNS = [
  ['live Stripe key', /sk_live_[A-Za-z0-9]{16,}/],
  ['Stripe restricted key', /rk_(live|test)_[A-Za-z0-9]{16,}/],
  ['Stripe test secret key', /sk_test_[A-Za-z0-9]{24,}/],
  ['Resend API key', /\bre_[A-Za-z0-9]{20,}\b/],
  ['Anthropic API key', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['private key block', /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ['Twilio account SID with token', /\bAC[0-9a-f]{32}\b/],
  ['signed JWT', /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/],
  ['database URL with a password', /postgres(?:ql)?:\/\/[^:@\s/'"`]+:(?!password|\*{3}|xxxx|PASSWORD|\$\{)[^@\s'"`]{6,}@(?!localhost|127\.0\.0\.1|db:|postgres:)[^\s'"`/]+/],
];

function scan(text) {
  const hits = [];
  for (const [name, pattern] of SECRET_PATTERNS) if (pattern.test(text)) hits.push(name);
  return hits;
}

test('security: no environment file or key file is tracked, and the ignore rules keep it that way', () => {
  const files = trackedFiles();
  const risky = files.filter((file) => /(^|\/)\.env(\.|$)/.test(file) && !/\.(example|sample|template)$/.test(file));
  assert.deepEqual(risky, [], 'an environment file is committed');
  assert.deepEqual(files.filter((file) => /\.(pem|key|p12|pfx|jks|keystore)$/i.test(file) || /(^|\/)id_(rsa|ed25519|ecdsa)$/.test(file)), [], 'a key file is committed');
  const ignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
  assert.match(ignore, /^\.env(\.\*|\.local)?\s*$/m, '.env is not git-ignored');
});

test('security: no credential appears in any tracked file', () => {
  const found = [];
  for (const file of trackedFiles().filter(isText)) {
    const path = join(ROOT, file);
    if (!existsSync(path) || statSync(path).size > 2_000_000) continue;
    const hits = scan(readFileSync(path, 'utf8'));
    if (hits.length) found.push(`${file}: ${hits.join(', ')}`);
  }
  assert.deepEqual(found, [], 'credential-shaped strings are committed');
});

test('security: no credential was ever committed, even if it has since been deleted', () => {
  // Only added lines of past commits, so a secret removed later is still found.
  // git's -G takes a POSIX regex (no \b or (?:)); it only narrows the commits, the precise JS patterns judge each added line.
  const narrow = ['sk_live_[A-Za-z0-9]{16,}', 'rk_(live|test)_[A-Za-z0-9]{16,}', 'sk_test_[A-Za-z0-9]{24,}', 're_[A-Za-z0-9]{20,}', 'sk-ant-[A-Za-z0-9_-]{20,}', 'AKIA[0-9A-Z]{16}', '-----BEGIN [A-Z ]*PRIVATE KEY-----', 'xox[baprs]-[A-Za-z0-9-]{10,}', 'gh[pousr]_[A-Za-z0-9]{30,}', 'eyJ[A-Za-z0-9_-]{15,}[.]eyJ', 'postgres(ql)?://[^: @/]+:[^@ ]{6,}@'].join('|');
  let history = '';
  try {
    history = git('log', '--all', '--no-color', '--format=commit %H', '-p', '-E', `-G${narrow}`, '--', '.', ':(exclude)*.lock', ':(exclude)package-lock.json', ':(exclude)*.png', ':(exclude)*.jpg');
  } catch (error) {
    assert.fail(`could not read git history: ${error.message}`);
  }
  const found = new Set();
  let commit = '';
  let file = '';
  for (const line of history.split('\n')) {
    if (line.startsWith('commit ')) commit = line.slice(7, 19);
    else if (line.startsWith('+++ b/')) file = line.slice(6);
    else if (line.startsWith('+') && !line.startsWith('+++')) {
      const hits = scan(line);
      if (hits.length) found.add(`${commit} ${file}: ${hits.join(', ')}`);
    }
  }
  assert.deepEqual([...found], [], 'a credential exists in git history — rotate it, then rewrite or accept the history');
  const everAdded = git('log', '--all', '--diff-filter=A', '--name-only', '--format=').split('\n').filter(Boolean);
  const files = everAdded.filter((name) => (/(^|\/)\.env(\.|$)/.test(name) && !/\.(example|sample|template)$/.test(name)) || /\.(pem|key|p12|pfx)$/i.test(name));
  assert.deepEqual([...new Set(files)], [], 'a secret-bearing file was committed at some point');
});

test('security: the production build ships no source maps and no credentials', () => {
  const dist = join(ROOT, 'dist');
  if (!existsSync(dist)) return; // nothing built in this checkout
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]));
  const files = walk(dist);
  assert.deepEqual(files.filter((file) => file.endsWith('.map')).map((file) => relative(ROOT, file)), [], 'source maps are published');
  const found = [];
  for (const file of files.filter((name) => /\.(js|css|html|json|txt|xml)$/.test(name))) {
    const text = readFileSync(file, 'utf8');
    const hits = scan(text);
    if (hits.length) found.push(`${relative(ROOT, file)}: ${hits.join(', ')}`);
    if (/\/\/# sourceMappingURL=/.test(text)) found.push(`${relative(ROOT, file)}: references a source map`);
    if (/SUPABASE_SERVICE_ROLE|SESSION_SECRET|STRIPE_SECRET|RESEND_API_KEY|ANTHROPIC_API_KEY|TWILIO_AUTH/.test(text)) found.push(`${relative(ROOT, file)}: names a server-only secret`);
  }
  assert.deepEqual(found, []);
});

test('security: encrypted secrets are authenticated, unique per encryption, and useless with the wrong key', () => {
  const key = 'k'.repeat(40);
  const plaintext = 'refresh-token-value';
  const first = encryptSecret(plaintext, key);
  const second = encryptSecret(plaintext, key);
  assert.notEqual(first, second, 'the same plaintext produced the same ciphertext (IV reuse)');
  assert.ok(!first.includes(plaintext));
  assert.equal(decryptSecret(first, key), plaintext);
  assert.throws(() => decryptSecret(first, 'z'.repeat(40)), 'a wrong key decrypted the value');
  // Flipping any part of IV, tag or ciphertext must be detected (AES-GCM).
  const [version, iv, tag, ciphertext] = first.split('.');
  const flip = (part) => `${part.slice(0, -2)}${part.slice(-2) === 'AA' ? 'BB' : 'AA'}`;
  for (const tampered of [`${version}.${flip(iv)}.${tag}.${ciphertext}`, `${version}.${iv}.${flip(tag)}.${ciphertext}`, `${version}.${iv}.${tag}.${flip(ciphertext)}`, `v2.${iv}.${tag}.${ciphertext}`, `${version}.${iv}.${tag}`, '', 'garbage']) {
    assert.throws(() => decryptSecret(tampered, key), `tampered value was accepted: ${tampered.slice(0, 30)}`);
  }
  assert.throws(() => encryptSecret(plaintext, 'short'), 'a short key was accepted');
  assert.throws(() => encryptSecret(plaintext, undefined), 'a missing key was accepted');
});

test('security: bearer tokens are 256-bit random values stored only as hashes', () => {
  const tokens = new Set(Array.from({ length: 2000 }, () => generateToken()));
  assert.equal(tokens.size, 2000, 'duplicate tokens generated');
  for (const token of [...tokens].slice(0, 50)) {
    assert.match(token, /^[0-9a-f]{64}$/, 'token is not 256 bits of hex');
    assert.notEqual(hashToken(token), token);
    assert.match(hashToken(token), /^[0-9a-f]{64}$/);
  }
  assert.equal(hashToken('a'), hashToken('a'));
  assert.notEqual(hashToken('a'), hashToken('b'));
  // Every hex digit should occur at every position often enough to rule out a stuck or biased generator.
  const perPosition = Array.from({ length: 64 }, () => new Set());
  for (const token of tokens) [...token].forEach((digit, index) => perPosition[index].add(digit));
  assert.ok(perPosition.every((digits) => digits.size === 16), 'a token position never takes some hex digits');
});

test('security: password hashing uses a strong, consistent cost and compares in constant time', () => {
  const auth = readFileSync(join(SERVER, 'src/routes/auth.js'), 'utf8');
  const rounds = Number(auth.match(/const SALT_ROUNDS = (\d+)/)?.[1]);
  assert.ok(rounds >= 12, `bcrypt cost ${rounds} is below 12`);
  assert.match(auth, /DUMMY_PASSWORD_HASH = bcrypt\.hashSync\([^)]*SALT_ROUNDS\)/, 'the decoy hash must use the same cost so login timing does not reveal accounts');
  for (const file of ['src/lib/twilioSms.js']) assert.match(readFileSync(join(SERVER, file), 'utf8'), /timingSafeEqual/, `${file} compares signatures without timingSafeEqual`);
  const usesBcryptEverywhere = readdirSync(join(SERVER, 'src/routes')).filter((file) => /passwordHash:/.test(readFileSync(join(SERVER, 'src/routes', file), 'utf8')) && !/bcrypt/.test(readFileSync(join(SERVER, 'src/routes', file), 'utf8')));
  assert.deepEqual(usesBcryptEverywhere.filter((file) => !['team.js', 'admin.js'].includes(file)), [], 'a route writes passwordHash without bcrypt');
});

test('security: production refuses weak or unsafe configuration', () => {
  const good = { NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@db/x', SESSION_SECRET: 's'.repeat(40), FRONTEND_URL: 'https://app.example.com', EXTRA_CLIENT_ORIGINS: 'https://app.example.com', REDIS_URL: 'redis://r', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
  assert.doesNotThrow(() => validateRuntimeConfig(good));
  const refuses = (changes, why) => assert.throws(() => validateRuntimeConfig({ ...good, ...changes }), undefined, why);
  refuses({ SESSION_SECRET: 'short' }, 'a short session secret was accepted');
  refuses({ SESSION_SECRET: '' }, 'a missing session secret was accepted');
  refuses({ FRONTEND_URL: 'http://app.example.com' }, 'an http frontend URL was accepted');
  refuses({ REDIS_URL: '' }, 'production without shared rate limiting was accepted');
  refuses({ EXTRA_CLIENT_ORIGINS: '' }, 'production with no trusted origin was accepted');
  // Origins that would be trusted for credentialed cross-origin requests must be exact https origins.
  for (const origin of ['http://app.example.com', '*', 'https://*.example.com', 'https://app.example.com/path', 'app.example.com', 'null', 'https://app.example.com, http://evil.example']) {
    refuses({ EXTRA_CLIENT_ORIGINS: origin }, `EXTRA_CLIENT_ORIGINS=${origin} was accepted in production`);
  }
  refuses({ QUICKBOOKS_CLIENT_ID: 'x' }, 'half-configured QuickBooks was accepted');
  refuses({ TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', API_PUBLIC_URL: 'http://api.example.com' }, 'SMS over an http callback URL was accepted');
});

// ---------------------------------------------------------------------------
// Tripwires: each lists what exists today, so a NEW occurrence fails until a
// person has looked at it and added it here with a reason.
// ---------------------------------------------------------------------------
const sourceFiles = (dir, pattern = /\.(js|jsx|mjs)$/) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(path, pattern);
  return pattern.test(entry.name) ? [path] : [];
});
const occurrences = (dir, regex) => sourceFiles(dir).flatMap((file) => readFileSync(file, 'utf8').split('\n').map((line, index) => (regex.test(line) ? `${relative(ROOT, file)}:${index + 1}` : null)).filter(Boolean));

test('security: tripwire — no dynamic code execution, shell access or string-built SQL on the server', () => {
  const server = join(SERVER, 'src');
  assert.deepEqual(occurrences(server, /\bnew Function\(|\beval\(|child_process|\bexecSync\(|\bspawn(Sync)?\(|queryRawUnsafe|executeRawUnsafe/).filter((hit) => !/rateLimiter\.js/.test(hit)), [], 'dynamic execution or unsafe SQL appeared');
  // Tagged-template $queryRaw is parameterised by Prisma; a plain call with a string is not.
  assert.deepEqual(occurrences(server, /\$(queryRaw|executeRaw)\(/), [], 'a non-template raw query appeared');
  assert.deepEqual(occurrences(server, /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED/), [], 'TLS verification is disabled somewhere');
});

test('security: tripwire — redirects only ever go to fixed locations or provider-signed URLs', () => {
  const known = new Set(['financials.js', 'googleCalendar.js', 'support.js', 'eventDocuments.js', 'admin.js', 'quickBooks.js', 'bookingDocuments.js']);
  const seen = new Set(occurrences(join(SERVER, 'src'), /res\.redirect\(/).map((hit) => hit.split('/').pop().split(':')[0]));
  assert.deepEqual([...seen].filter((file) => !known.has(file)), [], 'a new res.redirect needs a review: its target must never come from the request');
  for (const file of known) {
    for (const line of readFileSync(join(SERVER, 'src/routes', file), 'utf8').split('\n').filter((entry) => /res\.redirect\(/.test(entry))) {
      assert.doesNotMatch(line, /req\.(query|body|params)/, `${file}: a redirect target is built from the request`);
    }
  }
});

test('security: tripwire — links sent to people are never built from the Host header', () => {
  const hits = occurrences(join(SERVER, 'src'), /req\.(get|header)\('(host|x-forwarded-host)'\)|req\.headers\.host|req\.hostname/);
  // messaging.js falls back to Host only to rebuild the URL Twilio signed, when API_PUBLIC_URL is unset;
  // production config requires API_PUBLIC_URL whenever SMS is configured.
  assert.deepEqual(hits.filter((hit) => !/messaging\.js/.test(hit)), [], 'a link or callback URL is derived from the Host header');
});

test('security: tripwire — the browser never injects unsanitised HTML', () => {
  const lines = sourceFiles(join(ROOT, 'src')).flatMap((file) => readFileSync(file, 'utf8').split('\n').map((line, index) => ({ line, where: `${relative(ROOT, file)}:${index + 1}` })));
  const unsafe = lines.filter(({ line }) => /dangerouslySetInnerHTML/.test(line) && !/DOMPurify\.sanitize|iconDef\.svg/.test(line)).map(({ where }) => where);
  assert.deepEqual(unsafe, [], 'dangerouslySetInnerHTML is used with something other than DOMPurify output or a bundled icon');
  const writes = lines.filter(({ line }) => /\.(innerHTML|outerHTML)\s*=[^=]|insertAdjacentHTML|document\.write\(/.test(line)).map(({ where }) => where.split(':')[0]);
  // Rich-text editors that load the account's own template/draft text. Every value merged into those
  // bodies is escaped in src/lib/mergeFields.js, and the browser XSS test proves it end to end.
  const editors = new Set(['src/components/SetListEmailModal.jsx', 'src/components/PrepEmailModal.jsx', 'src/components/StagePlotEmailModal.jsx', 'src/components/EmailPreviewModal.jsx', 'src/pages/EmailTemplatesPage.jsx']);
  assert.deepEqual([...new Set(writes)].filter((file) => !editors.has(file)), [], 'a new innerHTML write needs a review');
  assert.deepEqual(lines.filter(({ line }) => /\beval\(|new Function\(/.test(line)).map(({ where }) => where), []);
});
