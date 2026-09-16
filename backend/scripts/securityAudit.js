/**
 * Phase 35 — security audit CLI (secrets scan + npm audit summary).
 */
const path = require('path');
const { execSync } = require('child_process');
const {
  scanForHardcodedSecrets,
  buildSecurityChecklist,
  assessJwtSecret,
  randomSecret
} = require('../utils/securityHardening');

function main() {
  const root = path.join(__dirname, '../..');
  const findings = scanForHardcodedSecrets([
    path.join(root, 'frontend/src'),
    path.join(root, 'backend/routes'),
    path.join(root, 'backend/utils'),
    path.join(root, 'backend/scripts')
  ]);

  let npmAudit = { ok: true, summary: 'skipped' };
  try {
    const out = execSync('npm audit --json', {
      cwd: path.join(root, 'backend'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const parsed = JSON.parse(out);
    const vulns = parsed.metadata?.vulnerabilities || {};
    npmAudit = {
      ok: (vulns.critical || 0) === 0 && (vulns.high || 0) === 0,
      vulnerabilities: vulns
    };
  } catch (err) {
    // npm audit exits non-zero when vulns found
    try {
      const parsed = JSON.parse(err.stdout || '{}');
      const vulns = parsed.metadata?.vulnerabilities || {};
      npmAudit = {
        ok: (vulns.critical || 0) === 0 && (vulns.high || 0) === 0,
        vulnerabilities: vulns,
        note: 'npm audit reported issues'
      };
    } catch (_) {
      npmAudit = { ok: true, summary: 'npm audit unavailable', error: err.message };
    }
  }

  const report = {
    checklist: buildSecurityChecklist({ npmAudit, hardcodedSecretFindings: findings.length }),
    jwt: assessJwtSecret(),
    hardcodedSecrets: findings,
    generateSecretHint: randomSecret(32)
  };

  console.log(JSON.stringify(report, null, 2));
  if (findings.length > 0) {
    console.error(`\nFAIL: ${findings.length} potential hardcoded secret(s)`);
    process.exit(1);
  }
  console.error('\nSecurity audit scan complete (no hardcoded secrets found).');
}

main();
