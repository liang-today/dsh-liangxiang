import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const git = args => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trimEnd();
const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const policyPath = process.env.LIANGXIANG_PRIVACY_POLICY || join(root, '.privacy-policy.json');
const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
const blocked = new Map();
for (const item of policy.blocked_phrase_hashes) {
  if (!blocked.has(item.length)) blocked.set(item.length, new Set());
  blocked.get(item.length).add(item.sha256);
}

export function inspectText(value, phrasePolicy = blocked) {
  const text = value.normalize('NFKC');
  const findings = new Set();
  // The policy stores digests only: private conversation labels never become
  // public fixtures, regular expressions or diagnostic excerpts themselves.
  for (const run of text.match(/\p{Script=Han}+/gu) ?? []) {
    const chars = [...run];
    for (const [length, hashes] of phrasePolicy) {
      for (let i = 0; i + length <= chars.length; i++) {
        const digest = createHash('sha256').update(chars.slice(i, i + length).join('')).digest('hex');
        if (hashes.has(digest)) findings.add('private-context');
      }
    }
  }
  if (/(?:\/Users\/|\/home\/)(?!runner(?:\/|\b))[a-zA-Z0-9._-]+(?:\/|\b)|[A-Z]:\\Users\\[a-zA-Z0-9._-]+/i.test(text)) findings.add('personal-path');
  if (/\/var\/folders\/|codex:\/\/threads\/|\.codex\/sessions\/|\b01[0-9a-f]{6}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(text)) findings.add('private-session');
  if (/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{24,})\b/.test(text)) findings.add('credential');
  for (const email of text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []) {
    if (!safeEmail(email)) findings.add('personal-email');
  }
  return [...findings];
}

function tryGit(args) {
  try { return git(args); } catch { return ''; }
}

/** The identity this clone commits as; the only identity a local commit may use. */
export function configuredIdentity() {
  const email = tryGit(['config', '--get', 'user.email']).trim();
  const name = tryGit(['config', '--get', 'user.name']).trim();
  return email && name ? { email, name } : null;
}

export function safeEmail(email) {
  return /^[^@\s]+@users\.noreply\.github\.com$/i.test(email) ||
    ['noreply@github.com', 'noreply@anthropic.com', 'noreply@openai.com'].includes(email.toLowerCase()) ||
    /@(?:example\.(?:com|org|net)|[^@]+\.invalid)$/i.test(email);
}

/** Identities the policy requires to sign their commits. */
export function requiresSignature(email, name) {
  const normalizedEmail = (email ?? '').trim().toLowerCase();
  const normalizedName = (name ?? '').normalize('NFKC').trim().toLowerCase();
  if (Object.hasOwn(policy.public_commit_identities ?? {}, normalizedEmail)) return true;
  return [
    ...Object.values(policy.public_commit_identities ?? {}).flat(),
    ...(policy.signed_commit_names ?? []),
  ].map(value => value.normalize('NFKC').trim().toLowerCase()).includes(normalizedName);
}

/** Maintained identities are the ones this project must be able to sign for. */
export function isMaintainedIdentity(email, name) {
  if (requiresSignature(email, name)) return true;
  const normalizedEmail = (email ?? '').trim().toLowerCase();
  const normalizedName = (name ?? '').normalize('NFKC').trim().toLowerCase();
  const configured = configuredIdentity();
  return Boolean(configured) &&
    (configured.email.toLowerCase() === normalizedEmail || configured.name.toLowerCase() === normalizedName);
}

export function assertNotToolIdentity(name) {
  const blocked = (policy.blocked_commit_names ?? []).map(value => value.toLowerCase());
  if (blocked.includes((name ?? '').normalize('NFKC').trim().toLowerCase())) {
    throw new Error('Commit identity must be the developer, never a tool or bot default');
  }
}

export function assertMetadata(email, name) {
  assertNotToolIdentity(name);
  const configured = configuredIdentity();
  const isSelf = Boolean(configured) && configured.email.toLowerCase() === (email ?? '').trim().toLowerCase();
  if (!isSelf && (!safeEmail(email) || /@(?:example\.(?:com|org|net)|[^@]+\.invalid)$/i.test(email))) {
    throw new Error('Commit identity must be this clone\'s own identity or a GitHub noreply email');
  }
  const allowedNames = policy.public_commit_identities?.[email.toLowerCase()];
  if (allowedNames && !allowedNames.includes(name?.normalize('NFKC'))) {
    throw new Error('Commit identity must use its configured public name');
  }
}

/** A signature only counts when it is attributable to the commit author. */
export function signatureFinding(status, signerEmail, authorEmail) {
  if (status !== 'G' && status !== 'U') return 'unsigned-commit';
  if ((signerEmail ?? '').trim().toLowerCase() !== (authorEmail ?? '').trim().toLowerCase()) {
    return 'signature-identity-mismatch';
  }
  return null;
}

/** Imported community metadata permits a contributor's public mailbox. */
export function inspectMetadata(email, name, community = false) {
  const identities = policy.public_commit_identities ?? {};
  const normalizedName = name?.normalize('NFKC').toLowerCase();
  const registeredEmail = Object.hasOwn(identities, (email ?? '').toLowerCase());
  const registeredName = Object.values(identities).some(names =>
    names.some(value => value.toLowerCase() === normalizedName));
  const configured = configuredIdentity();
  const isSelf = Boolean(configured) && configured.email.toLowerCase() === (email ?? '').toLowerCase();
  if (!community || registeredEmail || registeredName || isSelf) {
    assertMetadata(email, name);
    if ((registeredEmail || registeredName) && !registeredEmail) {
      throw new Error('Maintainer identity must use its configured public email');
    }
    return [];
  }
  return safeEmail(email) ? [] : ['public-commit-email'];
}

function privateFile(name) {
  return /(?:^|\/)\.env(?:\.|$)/.test(name) && !/\.(?:example|sample|template)$/.test(name) ||
    /\.(?:pem|p12|pfx|sqlite|sqlite3|db)(?:-wal|-shm)?$|(?:^|\/)id_(?:rsa|ed25519)$|(?:^|\/)\.dsh-home\//i.test(name);
}

function inspectFiles(staged, errors, ref = 'HEAD') {
  const names = git(staged ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'] : ['ls-tree', '-r', '--name-only', '-z', ref]).split('\0').filter(Boolean);
  for (const name of names) {
    if (privateFile(name)) {
      errors.push({ location: 'tracked-file', categories: ['private-file'] });
      continue;
    }
    const buffer = execFileSync('git', ['show', staged ? `:${name}` : `${ref}:${name}`], { maxBuffer: 32 * 1024 * 1024 });
    if (buffer.includes(0)) continue;
    const categories = inspectText(buffer.toString('utf8'));
    if (categories.length) errors.push({ location: 'tracked-file', categories });
  }
}

function inspectRange(range, errors, warnings = [], community = false) {
  for (const commit of git(['rev-list', range]).split('\n').filter(Boolean)) {
    const fields = git(['show', '-s', '--format=%ae%x00%ce%x00%an%n%cn%n%B', commit]).split('\0');
    const names = (fields[2] ?? '').split('\n');
    for (const [index, email] of fields.slice(0, 2).entries()) {
      const sensitive = inspectText(email).filter(category => category !== 'personal-email');
      if (sensitive.length) errors.push({ location: 'commit-metadata', categories: sensitive });
      try {
        const categories = inspectMetadata(email, names[index], community);
        if (categories.length) warnings.push({ location: 'commit-metadata', categories });
      } catch { errors.push({ location: 'commit-metadata', categories: ['private-identity'] }); }
    }
    const categories = inspectText(fields[2] ?? '');
    if (categories.length) errors.push({ location: 'commit-message', categories });
    const namesAdded = git(['show', '--format=', '--no-ext-diff', '--diff-merges=first-parent', '--name-only', '--diff-filter=ACMR', '-z', commit]).split('\0');
    if (namesAdded.some(privateFile)) errors.push({ location: 'commit-content', categories: ['private-file'] });
    // Scan additions in every outgoing commit: a secret introduced and then
    // deleted before the final head is still public in commit history.
    const patch = git(['show', '--format=', '--no-ext-diff', '--no-textconv', '--diff-merges=first-parent', commit]);
    const added = patch.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).join('\n');
    const additions = inspectText(added);
    if (additions.length) errors.push({ location: 'commit-content', categories: additions });
  }
}

function inspectSignatures(range, errors) {
  // Published commits are history: never demand a new signature for them.
  const published = new Set(tryGit(['rev-list', '--remotes']).split('\n').filter(Boolean));
  for (const commit of git(['rev-list', range]).split('\n').filter(Boolean)) {
    if (published.has(commit)) continue;
    const [authorEmail, authorName] = git(['show', '-s', '--format=%ae%n%an', commit]).split('\n');
    if (!isMaintainedIdentity(authorEmail, authorName)) continue;
    const [status, signer] = git(['show', '-s', '--format=%G?%n%GS', commit]).split('\n');
    const finding = signatureFinding(status?.trim(), signer?.match(/<([^>]+)>/)?.[1], authorEmail);
    if (finding) errors.push({ location: 'commit-signature', categories: [finding] });
  }
}

function assertLocalIdentity() {
  const configured = configuredIdentity();
  if (!configured) {
    throw new Error('Set user.name and user.email to your own Git identity before committing');
  }
  for (const variable of ['GIT_AUTHOR_IDENT', 'GIT_COMMITTER_IDENT']) {
    const ident = git(['var', variable]);
    const email = (ident.match(/<([^>]+)>/)?.[1] ?? '').trim();
    const name = (ident.match(/^(.+) </)?.[1] ?? '').trim();
    assertNotToolIdentity(name);
    if (email.toLowerCase() !== configured.email.toLowerCase() || name !== configured.name) {
      throw new Error('Commit identity must be this clone\'s configured identity; never borrow another account\'s');
    }
  }
  if (requiresSignature(configured.email, configured.name) &&
    tryGit(['config', '--get', 'commit.gpgsign']).trim().toLowerCase() !== 'true') {
    throw new Error('Maintained commits must be signed: set commit.gpgsign=true and user.signingkey');
  }
}

function pushBase(local, remote) {
  if (!/^0+$/.test(remote)) return remote;
  for (const name of ['upstream', 'origin', ...tryGit(['remote']).split('\n').filter(Boolean)]) {
    const base = tryGit(['merge-base', local, `${name}/main`]);
    if (base) return base;
  }
  // No fetched remote branch: check the new commit itself rather than refusing
  // to push. A hook that always fails teaches agents to remove the hook.
  return tryGit(['rev-parse', '--verify', `${local}^`]) || local;
}

export function run(args) {
  const errors = [];
  const warnings = [];
  if (args[0] === '--message') {
    const categories = inspectText(readFileSync(args[1], 'utf8'));
    if (categories.length) errors.push({ location: 'commit-message', categories });
  } else if (args[0] === '--pre-commit') {
    assertLocalIdentity();
    inspectFiles(true, errors);
  } else {
    const refIndex = args.indexOf('--ref');
    const ref = refIndex === -1 ? 'HEAD' : args[refIndex + 1];
    if (ref !== 'HEAD' && !/^[0-9a-f]{40}$/.test(ref ?? '')) throw new Error('Invalid scan ref');
    inspectFiles(false, errors, ref);
    if (args[0] === '--range') inspectRange(args[1], errors, warnings, args.includes('--community-pr'));
    if (args[0] === '--pre-push') {
      // Keep our own identity strict while preserving imported signed commits.
      const ident = git(['var', 'GIT_COMMITTER_IDENT']);
      assertMetadata(ident.match(/<([^>]+)>/)?.[1] ?? '', ident.match(/^(.+) </)?.[1]?.trim());
      const input = readFileSync(0, 'utf8');
      for (const line of input.trim().split('\n').filter(Boolean)) {
        const [, local, , remote] = line.split(' ');
        if (/^0+$/.test(local)) continue;
        const range = `${pushBase(local, remote)}..${local}`;
        inspectRange(range, errors, warnings, true);
        inspectSignatures(range, errors);
      }
    }
    for (const key of ['PR_TITLE', 'PR_BODY']) {
      const categories = inspectText(process.env[key] ?? '');
      if (categories.length) errors.push({ location: 'pr-description', categories });
    }
  }
  if (warnings.length) {
    // Advisory only; never repeat contributor addresses in logs or annotations.
    console.warn('::warning::Some contributor commit emails are public. GitHub noreply is optional; signed commits need not be rewritten.');
  }
  if (errors.length) {
    // Do not echo matched content, filenames, identities, tokens or PR bodies.
    console.error('Privacy gate rejected publication: ' + JSON.stringify(errors));
    console.error('Remove private context, paths, credentials or sensitive files; commit as this clone\'s own identity and sign with the key that carries that address. Do not bypass hooks.');
    return 1;
  }
  console.log('Privacy gate passed.');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = run(process.argv.slice(2)); }
  catch { console.error('Privacy gate could not complete; publication is blocked.'); process.exitCode = 1; }
}
