import { inject } from 'vue';
import { DEVTOOLS_KEY } from './plugin';
import type { DevToolsPluginContext } from './plugin';

export function useDevTools(): DevToolsPluginContext {
  const ctx = inject<DevToolsPluginContext>(DEVTOOLS_KEY);
  if (!ctx) {
    throw new Error('[useDevTools] DevToolsDetectorPlugin is not installed. Call app.use(DevToolsDetectorPlugin).');
  }
  return ctx;
}
