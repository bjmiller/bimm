import { type AppSettings } from '../../types';

interface SettingsProps {
  settings: AppSettings;
}

export const Settings = ({ settings }: SettingsProps) => {
  // eslint-disable-next-line no-magic-numbers
  return <div>{JSON.stringify(settings, null, 2)}</div>;
};
