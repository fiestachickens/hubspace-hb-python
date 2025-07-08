import { API } from 'homebridge';
import { HubspacePlatform } from './platform';

export = (api: API) => {
  api.registerPlatform('homebridge-home-depot-hubspace', 'Hubspace', HubspacePlatform);
};
