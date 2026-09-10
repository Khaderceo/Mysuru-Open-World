// Secret scan (TESTING_STRATEGY.md §3 item 7, PROJECT_SPEC.md §3).
//
// The build ships to a static host with no backend, so it must contain no credentials of
// any kind. Patterns match credential *shapes*, not the words "secret" or "token", so
// documentation that discusses them does not trip the check.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PATTERNS = [
  [/AKIA[0-9A-Z]{16}/, 'AWS access key id'],
  [/ghp_[A-Za-z0-9]{36}/, 'GitHub personal access token'],
  [/github_pat_[A-Za-z0-9_]{22,}/, 'GitHub fine-grained token'],
  [/gh[opsu]_[A-Za-z0-9]{36}/, 'GitHub token'],
  [/-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/, 'private key'],
  [/sk-[A-Za-z0-9]{32,}/, 'API secret key'],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/AIza[0-9A-Za-z_-]{35}/, 'Google API key'],
  [/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./, 'JWT'],
];

const SKIP = /(^|\/)(package-lock\.json|dist\/)/;

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter((path) => path.length > 0 && !SKIP.test(path));

const findings = [];
for (const path of tracked) {
  let content;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    continue; // Binary or unreadable; nothing to scan.
  }
  for (const [pattern, label] of PATTERNS) {
    if (pattern.test(content)) findings.push(`${path}: looks like a ${label}`);
  }
}

if (findings.length > 0) {
  console.error('[static] possible credentials in tracked files:');
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}
console.log(`[static] no credential-shaped strings in ${String(tracked.length)} tracked files`);
