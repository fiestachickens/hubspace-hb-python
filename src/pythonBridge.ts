import { spawnSync, spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export class PythonBridge {
  private proc: ChildProcessWithoutNullStreams;
  private callbacks: ((msg: any) => void)[] = [];

  constructor(
    private email: string,
    private password: string,
    private pluginRoot: string
  ) {
    const pyDir = path.join(pluginRoot, 'vendor', 'python');
    const venvDir = path.join(pyDir, '.venv');

    if (!fs.existsSync(path.join(venvDir, 'bin', 'python'))) {
      console.log('[Hubspace] Setting up Python virtualenv...');
      spawnSync('python3', ['-m', 'venv', '.venv'], { cwd: pyDir, stdio: 'inherit' });
      spawnSync(path.join(venvDir, 'bin', 'pip'), ['install', '-r', 'requirements.txt'], { cwd: pyDir, stdio: 'inherit' });
    }

    const exe = path.join(venvDir, 'bin', 'python');
    const script = path.join(pyDir, 'hubspace_cli.py');

    this.proc = spawn(exe, [script]);

    this.proc.stdout.on('data', (buf) => {
      const lines = buf.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        const cb = this.callbacks.shift();
        if (cb) cb(JSON.parse(line));
      }
    });

    this.proc.stderr.on('data', (buf) => {
      console.error('[Hubspace Python stderr]', buf.toString());
    });
  }

  private send(payload: any): Promise<any> {
    return new Promise(resolve => {
      this.callbacks.push(resolve);
      this.proc.stdin.write(JSON.stringify(payload) + '\n');
    });
  }

  async login() {
    return await this.send({ command: 'login', email: this.email, password: this.password });
  }

  async getDevices() {
    return await this.send({ command: 'get_devices' });
  }

  async setDeviceState(deviceId: string, state: any) {
    return await this.send({ command: 'set_device_state', device_id: deviceId, state });
  }
}
