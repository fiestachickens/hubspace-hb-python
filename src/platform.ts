import { API, DynamicPlatformPlugin, Logger, PlatformConfig, PlatformAccessory } from 'homebridge';
import { isConfigValid } from './config';
import { PythonBridge } from './pythonBridge';
import { SwitchAccessory } from './accessories/SwitchAccessory';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings'; 
import path from 'path';

export class HubspacePlatform implements DynamicPlatformPlugin {
  private deviceMap: Map<string, SwitchAccessory> = new Map();
  public bridge!: PythonBridge;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API
  ) {
    if (!isConfigValid(config)) {
        this.log.error('Configuration is invalid. Platform will not start.');
        return;
    }

    this.api.on('didFinishLaunching', async () => {
      const pluginRoot = path.join(__dirname, '..');
      this.bridge = new PythonBridge(config.email, config.password, pluginRoot);

      try {
        await this.bridge.login();

        const res = await this.bridge.getDevices();

        res.devices.forEach((device: any) => {
          if (device.type === 'switch') {
            const uuid = this.api.hap.uuid.generate(device.device_id);
            const accessory = new this.api.platformAccessory(device.name, uuid);
            const switchAccessory = new SwitchAccessory(this, accessory, device);

            this.deviceMap.set(device.device_id, switchAccessory);
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
          } else {
            this.log.warn(`Unsupported device type: ${device.type}`);
          }
        });

        setInterval(async () => {
          try {
            const updated = await this.bridge.getDevices();
            updated.devices.forEach((updatedDevice: any) => {
              const accessory = this.deviceMap.get(updatedDevice.device_id);
              if (accessory) {
                accessory.updateFromHubspace(updatedDevice);
              }
            });
          } catch (e) {
            this.log.error('Polling error:', e);
          }
        }, 15000);

      } catch (err) {
        this.log.error('Error initializing Hubspace plugin:', err);
      }
    });
  }

  // TODO: We need to handle cached accessories as well
  configureAccessory(accessory: PlatformAccessory): void {
    // Required for restoring cached accessories
  }
}
