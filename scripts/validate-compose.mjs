#!/usr/bin/env node
/**
 * Valideert docker-compose.yml. Gebruikt `docker compose` (V2) als beschikbaar,
 * anders `docker-compose` (V1 / Homebrew).
 *
 * Zet een tijdelijke JWT_SECRET als die ontbreekt — alleen voor `config`.
 * Productie: zet een sterk JWT_SECRET in repo-root `.env`.
 *
 * Standaard: alleen een korte regel bij succes. Volledige YAML: `VERBOSE=1` of `--verbose`.
 */
import { execSync, spawnSync } from 'child_process';

const env = {
  ...process.env,
  JWT_SECRET:
    process.env.JWT_SECRET
    || 'validate-compose-only-min-32-characters-long',
};

const verbose =
  process.argv.includes('--verbose')
  || process.env.VERBOSE === '1'
  || process.env.VERBOSE === 'true';

function hasComposeV2() {
  try {
    execSync('docker compose version', { stdio: 'ignore', shell: true, env });
    return true;
  } catch {
    return false;
  }
}

function validate() {
  const useV2 = hasComposeV2();
  const bin = useV2 ? 'docker' : 'docker-compose';
  const args = useV2 ? ['compose', 'config'] : ['config'];

  const r = spawnSync(bin, args, {
    env,
    encoding: 'utf8',
    cwd: process.cwd(),
  });

  if (r.error) {
    console.error(r.error.message);
    console.error(
      'Tip: installeer Docker Desktop of: brew install docker-compose'
    );
    return false;
  }

  if (r.status !== 0) {
    const err = `${r.stderr || ''}${r.stdout || ''}`.trim();
    console.error(err || 'Compose config failed.');
    if (/unknown command|not found|No such file|cannot find/i.test(err)) {
      console.error(
        '\nTip: Docker Desktop (inclusief `docker compose`) of `brew install docker-compose`.'
      );
    }
    return false;
  }

  if (verbose) {
    process.stdout.write(r.stdout || '');
  } else {
    console.log(
      `✓ docker-compose.yml is valid (${useV2 ? 'docker compose' : 'docker-compose'})`
    );
  }
  return true;
}

process.exit(validate() ? 0 : 1);
