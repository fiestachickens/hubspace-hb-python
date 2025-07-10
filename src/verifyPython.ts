import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { Logger } from 'homebridge';

export function verifyPythonEnvironment(pythonPath: string, script: string, log: Logger): void {
  try {
    // Check Python version
    const pythonVersion = execSync(`${pythonPath} --version`).toString().trim();
    log.info(`[Python Check] Python version: ${pythonVersion}`);

    // Check if the Python script exists
    execSync(`test -f ${script}`);
    log.info(`[Python Check] ${script} exists`);

    // Check required Python packages
    const requiredModules = ['requests'];
    requiredModules.forEach(mod => {
      try {
        execSync(`${pythonPath} -c "import ${mod}"`);
        log.info(`[Python Check] Python module '${mod}' is installed.`);
      } catch (modErr) {
        log.error(`[Python Check] Missing Python module: '${mod}'`);
        throw new Error(`[Python Check] Missing Python module: '${mod}'`);
      }
    });

    // Run JSON-based sanity check
    const sanityRaw = execSync(`${pythonPath} ${script} --sanity-check`).toString();
    const sanity = JSON.parse(sanityRaw);

    if (sanity.status !== 'ok') {
      throw new Error(`[Python Check] Sanity check failed. Got: ${sanityRaw}`);
    }

    log.info(`[Python Check] ✅ Sanity check passed: ${sanity.message || ''}`);
  } catch (error: any) {
    log.error(`[Python Check] ❌ Environment check failed: ${error.message || error}`);
    throw error;
  }
}
