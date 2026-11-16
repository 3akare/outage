// Pattern scanners used by the guard hooks and by push-to-main as a last check.
// No dependencies. Each finder returns [{ rule, line, text }].

const ALLOW_SECRET = /secrets-guard:allow/;
const ALLOW_PRIVACY = /privacy-guard:allow/;

const PLACEHOLDER = /(example|placeholder|your[-_ ]|<[^>]+>|x{4,}|changeme|dummy|fake|redacted|\$\{|process\.env|env\.|\bbinding)/i;

export const SECRET_RULES = [
  ['AWS access key id', /\bAKIA[0-9A-Z]{16}\b/],
  ['private key block', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{50,}\b/],
  ['service account key', /"private_key"\s*:\s*"-----BEGIN/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ['bearer token literal', /Bearer\s+[A-Za-z0-9_\-.=]{24,}/],
  ['assigned secret', /(?:secret|token|api[_-]?key|apikey|password|passwd|private[_-]?key|access[_-]?key)["']?\s*[:=]\s*["'][A-Za-z0-9_\-/+=.]{20,}["']/i],
];

export function findSecrets(text) {
  const out = [];
  text.split('\n').forEach((line, idx) => {
    if (ALLOW_SECRET.test(line)) return;
    for (const [rule, re] of SECRET_RULES) {
      if (re.test(line)) {
        if (rule === 'assigned secret' && PLACEHOLDER.test(line)) continue;
        out.push({ rule, line: idx + 1, text: redact(line) });
        break;
      }
    }
  });
  return out;
}

const redact = (l) => l.trim().slice(0, 80).replace(/([A-Za-z0-9_\-/+=.]{6})[A-Za-z0-9_\-/+=.]{8,}/g, '$1***');

/** Files that must never be committed or written (secret-bearing). */
export function sensitivePath(p) {
  const base = p.split('/').pop() || '';
  if (/^\.env(\..+)?$/.test(base) && !/\.(example|sample|template)$/.test(base)) return '.env file (use Wrangler secrets and GitHub Actions secrets)';
  if (base === '.dev.vars' || /^\.dev\.vars\./.test(base)) return 'Wrangler local secrets file';
  if (/\.(pem|p12|pfx|jks|keystore)$/.test(base)) return 'key or keystore file';
  if (/service-?account.*\.json$/i.test(base)) return 'service account key';
  if (base === 'google-services.json' || base === 'GoogleService-Info.plist') return 'Firebase client config (keep it out of git; CI writes it from a GitHub Actions secret)';
  return null;
}

const CODE_EXT = /\.(ts|js|mjs|cjs|kt|kts|java|json|xml|gradle)$/;
const PRIVACY_SKIP = /(^|\/)(node_modules|\.kiro|docs|dist|build|\.gradle|fixtures|__tests__|test|tests|catalog)\/|\.(test|spec)\.[a-z]+$|Test\.kt$|\.md$|package(-lock)?\.json$/;

export function privacyApplies(p) {
  return CODE_EXT.test(p) && !PRIVACY_SKIP.test(p) && !/^android\/probe\//.test(p);
}

const PERMISSIONS = /\b(RECORD_AUDIO|ACCESS_FINE_LOCATION|ACCESS_BACKGROUND_LOCATION|READ_CONTACTS|READ_PHONE_STATE|READ_PHONE_NUMBERS|READ_SMS|READ_CALL_LOG|BODY_SENSORS)\b/;
const COORD_PAIR = /(-?\d{1,2}\.\d{4,})\s*,\s*(-?\d{1,3}\.\d{4,})/;
const COORD_WORD = /\b(lat(?:itude)?|lng|lon(?:gitude)?|coords?)\b/i;
const PERSIST = /(setItem|SharedPreferences|putString|putFloat|putDouble|openFileOutput|SQLite|execSQL|ContentValues|\binsert\b|INSERT|storage\.sql|storage\.put|JSON\.stringify|JSONObject|console\.(?:log|info|warn|error|debug)|logger\.|\bLog\.[dviwe]\(|fetch\(|HttpURLConnection|outputStream|\bbody\s*:|putExtra|\.put\()/;
const PII_IDENT = /\b(phone_?number|msisdn|contact_?name|full_?name|first_?name|last_?name|e_?mail)\b/i;
const SENSORS = /(TYPE_ACCELEROMETER|\bAccelerometer\b|\bAudioRecord\b|\bMediaRecorder\b)/;

/** Privacy rules from .kiro/steering/privacy.md, for code paths only. */
export function findPrivacy(relPath, text) {
  if (!privacyApplies(relPath)) return [];
  const lines = text.split('\n');
  const out = [];
  lines.forEach((line, idx) => {
    if (ALLOW_PRIVACY.test(line)) return;
    const near = [lines[idx - 1] || '', line, lines[idx + 1] || ''];
    if (PERMISSIONS.test(line)) out.push({ rule: 'forbidden permission (no microphone, no fine or background location, no contacts or phone state)', line: idx + 1, text: line.trim().slice(0, 80) });
    else if (SENSORS.test(line)) out.push({ rule: 'accelerometer or microphone recording API', line: idx + 1, text: line.trim().slice(0, 80) });
    else if (COORD_PAIR.test(line)) out.push({ rule: 'literal coordinate pair', line: idx + 1, text: line.trim().slice(0, 80) });
    else if (PII_IDENT.test(line)) out.push({ rule: 'personal data field (phone number, name, email)', line: idx + 1, text: line.trim().slice(0, 80) });
    else if (COORD_WORD.test(line) && near.some((l) => PERSIST.test(l)) && !near.some((l) => ALLOW_PRIVACY.test(l))) {
      out.push({ rule: 'coordinates near storage, logging or network code (store only the H3 cell)', line: idx + 1, text: line.trim().slice(0, 80) });
    }
  });
  return out;
}

export const formatFindings = (file, findings) =>
  findings.map((f) => `  ${file}:${f.line}  ${f.rule}\n    ${f.text}`).join('\n');
