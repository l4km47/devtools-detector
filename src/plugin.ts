import type { App, Ref } from 'vue';
import { ref, readonly } from 'vue';
import { DevToolsDetector } from './detector';
import type { DevToolsDetectorOptions } from './detector';

export const DEVTOOLS_KEY = Symbol('alpha-sec-system');

export interface DevToolsPluginOptions extends DevToolsDetectorOptions {
  action?: 'break' | 'warn' | 'custom';
  onOpen?: () => void;
  onClose?: () => void;
  productionOnly?: boolean;
}

export interface DevToolsPluginContext {
  isOpen: Readonly<Ref<boolean>>;
  detector: DevToolsDetector;
}

function injectBreakOverlay(): void {
  if (document.getElementById('__devtools-overlay__')) return;
  const overlay = document.createElement('div');
  overlay.id = '__devtools-overlay__';
  overlay.innerHTML = `
    <style>
      #__devtools-overlay__ { position: fixed; inset: 0; z-index: 2147483647; background: #0a0a0a; display: flex; align-items: center; justify-content: center; font-family: 'Courier New', monospace; color: #ff0033; text-align: center; padding: 2rem; cursor: default; user-select: none; }
      #__devtools-overlay__ h1 { font-size: clamp(1.4rem, 4vw, 2.2rem); font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; margin: 0 0 1rem; color: #ff0033; }
      #__devtools-overlay__ p { color: #666; max-width: 440px; line-height: 1.6; margin: 0 0 2rem; }
    </style>
    <div>
      <h1>ACCESS_TERMINATED</h1>
      <p>Developer Tools have been detected. This session has been suspended for security reasons.</p>
    </div>
  `;
  document.documentElement.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  document.body.style.pointerEvents = 'none';
  overlay.style.pointerEvents = 'auto';
}

function removeBreakOverlay(): void {
  const overlay = document.getElementById('__devtools-overlay__');
  if (overlay) overlay.remove();
  document.body.style.overflow = '';
  document.body.style.pointerEvents = '';
}

export const DevToolsDetectorPlugin = {
  install(app: App, options: DevToolsPluginOptions = {}) {
    const { action = 'break', onOpen, onClose, productionOnly = false, ...detectorOptions } = options;
    if (productionOnly && (import.meta as any)?.env?.DEV) return;

    const isOpen: Ref<boolean> = ref(false);
    const detector = new DevToolsDetector({ ...detectorOptions, onChange(open) {
      isOpen.value = open;
      if (open) {
        onOpen?.();
        if (action === 'break') injectBreakOverlay();
      } else {
        onClose?.();
        if (action === 'break') removeBreakOverlay();
      }
    }});

    detector.start();

    const ctx: DevToolsPluginContext = { isOpen: readonly(isOpen), detector };
    app.provide(DEVTOOLS_KEY, ctx);
    app.config.globalProperties.$devtools = ctx;

    const originalUnmount = app.unmount;
    app.unmount = () => {
      detector.stop();
      originalUnmount?.();
    };
  },
};
