import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { HubspacePlatform } from '../platform';

export class SwitchAccessory {
  private service: Service;
  private state: boolean;

  constructor(
    private readonly platform: HubspacePlatform,
    private readonly accessory: PlatformAccessory,
    private device: any
  ) {
    const { Service, Characteristic } = this.platform.api.hap;

    this.platform.logDebug("Initializing this switch...");
    this.platform.logDebug(JSON.stringify(device));
    this.state = device.state?.power;

    accessory.getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, 'Hubspace')
      .setCharacteristic(Characteristic.Model, device.product_name || 'Switch')
      .setCharacteristic(Characteristic.SerialNumber, device.id);

    this.service = accessory.getService(Service.Switch)
      || accessory.addService(Service.Switch);

    this.service.setCharacteristic(Characteristic.Name, device.nickname || device.name);

    this.service.getCharacteristic(Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));

    this.service.updateCharacteristic(Characteristic.On, this.state);
  }

  async setOn(value: CharacteristicValue) {
    const isOn = value as boolean;
    this.state = isOn;

    this.platform.logDebug(`Setting switch ${this.device.name} to ${isOn ? 'on' : 'off'}`);

    await this.platform.bridge.setDeviceState(this.device.device_id, {
      power: isOn ? 'on' : 'off',
    });
  }

  async getOn(): Promise<CharacteristicValue> {
    return this.state;
  }

  updateFromHubspace(device: any) {
    const newState = device.state?.power === 'on';
    if (newState !== this.state) {
      this.state = newState;
      this.service.updateCharacteristic(this.platform.api.hap.Characteristic.On, newState);
      this.platform.logDebug(`Updated switch ${device.name} state to ${newState ? 'on' : 'off'}`);
    }
  }
}
