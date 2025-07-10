import { API, DynamicPlatformPlugin, Logger, PlatformConfig, PlatformAccessory } from 'homebridge';
import { isConfigValid } from './config';
import { PythonBridge } from './pythonBridge';
import { SwitchAccessory } from './accessories/SwitchAccessory';
import { PLATFORM_NAME, PLUGIN_NAME, POLLING_INTERVAL } from './settings'; 
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

      try {
        this.bridge = new PythonBridge(
          this.log,
          config.email,
          config.password,
          pluginRoot,
          config.doDebugLogging
        );

        // Ensure the process is cleanly shutdown 
        process.on('exit', () => this.bridge.shutdown());
        process.on('SIGINT', () => this.bridge.shutdown());
        process.on('SIGTERM', () => this.bridge.shutdown());

        if (this.config.doDebugLogging) {
          this.log.info("[ DEBUG ]: Getting devices...");
        }

        const res = await this.bridge.getDevices();

        if (this.config.doDebugLogging) {
          this.log.info(`[ DEBUG ]: Initial Devices: ${JSON.stringify(res)}`);
        }

        if (!res) {
          this.log.info(`No devices returned: ${JSON.stringify(res)}`);
          return;
        }

        res.forEach((device: any) => {
          switch (device.type) {
            case "switch":
              this.configureSwitch(device);
              break;
            default:
              this.log.warn(`Unsupported device type: ${device.type}`);
          }
        });

        // Configure polling
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
        }, POLLING_INTERVAL * 1000);

      } catch (err) {
        this.log.error('Error initializing Hubspace plugin:', err);
        throw err;
      }
    });
  }

  public logDebug(message: string) {
    if (this.config.doDebugLogging) {
      this.log.info(`[ DEBUG ]: ${message}`);
    }
  }


  configureSwitch(device: any) { 
    const uuid = this.api.hap.uuid.generate(device.id);
    const accessory = new this.api.platformAccessory(device.name, uuid);
    const switchAccessory = new SwitchAccessory(this, accessory, device);

    this.deviceMap.set(device.device_id, switchAccessory);
    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
  }

  // TODO: We need to handle cached accessories as well
  configureAccessory(accessory: PlatformAccessory): void {
    // Required for restoring cached accessories
  }
}
