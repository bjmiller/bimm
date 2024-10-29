export interface AppSettings {
  directories?: string[];
}

export interface TRPCContext {
  settings?: AppSettings;
}
