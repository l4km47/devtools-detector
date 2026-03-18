import { inject } from 'vue';
import { DEVTOOLS_KEY } from './plugin';
import type { DevToolsPluginContext } from './plugin';

/**
 * Composable helper to retrieve detector context from Vue inject.
 * Throws if plugin is not installed.
 */
export function useDevTools(): DevToolsPluginContext {
  const ctx = inject<DevToolsPluginContext>(DEVTOOLS_KEY);
  if (!ctx) {
    throw new Error('[useDevTools] DevToolsDetectorPlugin is not installed. Call app.use(DevToolsDetectorPlugin).');
  }
  return ctx;
}
