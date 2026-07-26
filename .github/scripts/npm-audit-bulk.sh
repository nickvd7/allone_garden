#!/bin/bash
# Custom npm audit script using the bulk advisory API
# Works around npm 11.x gzip parsing bug

set -euo pipefail

echo "=== Running custom npm audit (critical, production only) ==="
echo ""

# Generate package inventory
PACKAGES=$(node << 'EOF'
const lock = require('./package-lock.json');
const installed = {};

if (lock.packages) {
  for (const [path, pkg] of Object.entries(lock.packages)) {
    if (pkg.dev || pkg.devOptional || !pkg.version) continue;
    const name = pkg.name || path.replace(/^node_modules\//, '').split('/node_modules/').pop();
    if (name && name !== '' && name !== 'node_modules') {
      if (!installed[name]) installed[name] = [];
      if (!installed[name].includes(pkg.version)) installed[name].push(pkg.version);
    }
  }
}

console.log(JSON.stringify(installed));
EOF
)

echo "Fetching advisories for $(echo "$PACKAGES" | node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync(0, 'utf8'))).length)") packages..."
echo ""

# Call bulk advisory API with curl and gunzip
ADVISORIES=$(curl -s -H "Content-Type: application/json" \
  -H "Accept-Encoding: gzip" \
  -X POST https://registry.npmjs.org/-/npm/v1/security/advisories/bulk \
  -d "$PACKAGES" | gunzip 2>/dev/null || echo "{}")

# Check for critical vulnerabilities
node << 'EOF'
const semver = require('semver');
const advisories = JSON.parse(process.env.ADVISORIES || '{}');
const installed = JSON.parse(process.env.PACKAGES || '{}');

const criticalVulns = [];

for (const [pkg, advList] of Object.entries(advisories)) {
  if (!installed[pkg]) continue;
  
  for (const adv of advList) {
    if (adv.severity !== 'critical') continue;
    
    const affectedVersions = installed[pkg].filter(v => {
      try {
        return semver.satisfies(v, adv.vulnerable_versions);
      } catch (e) {
        return false;
      }
    });
    
    if (affectedVersions.length > 0) {
      criticalVulns.push({
        package: pkg,
        versions: affectedVersions,
        title: adv.title,
        vulnerable: adv.vulnerable_versions,
        url: adv.url
      });
    }
  }
}

console.log('=== Audit Results ===');
console.log(`Critical vulnerabilities found: ${criticalVulns.length}`);
console.log('');

if (criticalVulns.length > 0) {
  console.log('Critical vulnerabilities:');
  for (const vuln of criticalVulns) {
    console.log(`  - ${vuln.package}@${vuln.versions.join(', ')}: ${vuln.title}`);
    console.log(`    Vulnerable: ${vuln.vulnerable}`);
    console.log(`    Info: ${vuln.url}`);
    console.log('');
  }
  process.exit(1);
} else {
  console.log('No critical vulnerabilities found!');
  process.exit(0);
}
EOF
