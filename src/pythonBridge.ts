import { Logger } from 'homebridge';
import { spawnSync, spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { verifyPythonEnvironment } from './verifyPython';
import * as fs from 'fs';
import * as path from 'path';
import { POLLING_INTERVAL } from './settings'; 

export class PythonBridge {
  private proc: ChildProcessWithoutNullStreams;
  private callbacks: ((msg: any) => void)[] = [];

  constructor(
    private log: Logger,
    private email: string,
    private password: string,
    private pluginRoot: string,
    private doDebugLogging: boolean
  ) {
    const pyDir = path.join(pluginRoot, 'vendor', 'python');
    const venvDir = path.join(pyDir, '.venv');

    if (!fs.existsSync(path.join(venvDir, 'bin', 'python'))) {
      if (this.doDebugLogging) {
        this.log.info('[ DEBUG ]: Setting up Python virtualenv...');
      }

      spawnSync('python3', ['-m', 'venv', '.venv'], { cwd: pyDir, stdio: 'inherit' });
      spawnSync(path.join(venvDir, 'bin', 'pip'), ['install', '-r', 'requirements.txt'], {
        cwd: pyDir,
        stdio: 'inherit'
      });
    }

    this.log.info('Starting up Python...');

    const exe = path.join(venvDir, 'bin', 'python');
    const script = path.join(pyDir, 'hubspace_cli.py');

    verifyPythonEnvironment(exe, script, this.log, this.doDebugLogging);

    if (this.doDebugLogging) {
      this.log.info(`[ DEBUG ]: Launching Python script`);
    }

    this.proc = spawn(exe, [
      script,
      email,
      password,
      POLLING_INTERVAL.toString()
    ]);

    // If the process ends early, we can no longer function.
    // TODO: This may require some hardening to handle if the plugin is restarted in boot phase
    // TODO: Consider restarting before fully failing in the future
    this.proc.on('exit', (code, signal) => {
      this.log.warn(`Python process exited with code ${code}, signal ${signal}`);
      throw new Error("Python exited early");
    });

    // Listen for feedback
    this.proc.stdout.on('data', (buf) => {
      const lines = buf.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          const cb = this.callbacks.shift();
          if (cb) {
            cb(parsed);
          } else {
            // TODO: If this happens, check for the closed message
            this.log.warn('[Hubspace Python] Received data but no callback is waiting:', parsed);
          }
        } catch (err) {
          this.log.error('[Hubspace Python] Failed to parse stdout:', err, line);
        }
      }
    });

    this.proc.stderr.on('data', (buf) => {
      this.log.error('[Hubspace Python stderr]', buf.toString());
      throw new Error('[Hubspace Python stderr]: ' + buf.toString());
    });
  }

  public shutdown() {
    if (this.proc) {
      if (this.doDebugLogging) {
        this.log.info('[ DEBUG ]: Terminating Python subprocess...');
      }

      this.proc.kill('SIGTERM');
    }
  }

  private send(payload: any, timeoutMs = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timeout waiting for response from Python'));
      }, timeoutMs);

      this.callbacks.push((result) => {
        clearTimeout(timer);
        resolve(result);
      });

      try {
        const json = JSON.stringify(payload);
        this.proc.stdin.write(json + '\n');
      } catch (err) {
        reject(err);
      }
    });
  }

  async getDevices() {
    return await this.send({ command: 'list_devices' });
  }

  async setDeviceState(deviceId: string, state: any) {
    if (this.doDebugLogging) {
      this.log.info("[ DEBUG ]: Setting Device state: ", deviceId, state);
    }

    return await this.send({ command: 'set_device_state', device_id: deviceId, state });
  }
}
