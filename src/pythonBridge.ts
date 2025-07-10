import { Logger } from 'homebridge';
import { spawnSync, spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { verifyPythonEnvironment } from './verifyPython';
import * as fs from 'fs';
import * as path from 'path';

export class PythonBridge {
  private proc: ChildProcessWithoutNullStreams;
  private callbacks: ((msg: any) => void)[] = [];

  constructor(
    private log: Logger,
    private email: string,
    private password: string,
    private pluginRoot: string
  ) {
    const pyDir = path.join(pluginRoot, 'vendor', 'python');
    const venvDir = path.join(pyDir, '.venv');

    if (!fs.existsSync(path.join(venvDir, 'bin', 'python'))) {
      this.log.info('Setting up Python virtualenv...');
      spawnSync('python3', ['-m', 'venv', '.venv'], { cwd: pyDir, stdio: 'inherit' });
      spawnSync(path.join(venvDir, 'bin', 'pip'), ['install', '-r', 'requirements.txt'], {
        cwd: pyDir,
        stdio: 'inherit'
      });
    }

    this.log.info('Starting up Python...');

    // TODO: We need to better error handle so the plugin doesn't crap out
    const exe = path.join(venvDir, 'bin', 'python');
    const script = path.join(pyDir, 'hubspace_cli.py');

    verifyPythonEnvironment(exe, script, this.log);

    this.log.info(`Launching Python with args: ${email} / ${password}`);
    this.proc = spawn(exe, [
      script,
      email,
      password
    ]);

    // TODO: Come back to this
    this.proc.on('exit', (code, signal) => {
      this.log.warn(`Python process exited with code ${code}, signal ${signal}`);
      throw new Error("Python exited early");
    });

    this.proc.stdout.on('data', (buf) => {
      const lines = buf.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          const cb = this.callbacks.shift();
          if (cb) {
            cb(parsed);
          } else {
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
      this.log.info('Terminating Python subprocess...');
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

  // TODO: DRop me
  async login() {
    const res = await this.send({
      command: 'login',
      email: this.email,
      password: this.password
    });

    if (!res || res.error || res.status !== 'ok') {
      this.log.error(`[Hubspace Login] Login failed: ${res?.error || JSON.stringify(res)}`);
      throw new Error('Hubspace login failed');
    }

    this.log.info(`[Hubspace Login] Login successful.`);
  }

  async getDevices() {
    return await this.send({ command: 'list_devices' });
  }

  async setDeviceState(deviceId: string, state: any) {
    return await this.send({ command: 'set_device_state', device_id: deviceId, state });
  }
}
