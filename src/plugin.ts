import type { App, Ref, Plugin } from 'vue';
import { ref, readonly } from 'vue';
import { DevToolsDetector } from './detector';
import type { DevToolsDetectorOptions } from './detector';

// Injection key for Vue provide/inject context.
export const DEVTOOLS_KEY = Symbol('alpha-sec-system');

// Plugin options extend detector options with Vue-specific actions.
export interface DevToolsPluginOptions extends DevToolsDetectorOptions {
  action?: 'break' | 'warn' | 'custom';
  onOpen?: () => void;
  onClose?: () => void;
  productionOnly?: boolean;
}

// Runtime context exposed to components.
export interface DevToolsPluginContext {
  isOpen: Readonly<Ref<boolean>>;
  detector: DevToolsDetector;
}

let _overlayObserver: MutationObserver | null = null;
let _isDetected = false;

/**
 * Injects a full-page break overlay using a closed Shadow DOM.
 * mode:'closed' means shadowRoot returns null from outside — cannot be queried via console.
 * MutationObserver re-injects if host or CSS lock are removed.
 * HTML element pointer-events lock persists even if overlay node is deleted.
 */
function injectBreakOverlay(): void {
  if (document.getElementById('__devtools-sentinel__')) return;

  const host = document.createElement('div');
  host.id = '__devtools-sentinel__';
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    :host {
      position: fixed; inset: 0; z-index: 2147483647;
      display: flex; align-items: center; justify-content: center;
      background: #0a0a0a; font-family: 'Courier New', monospace;
      color: #ff0033; text-align: center; padding: 2rem;
      cursor: default; user-select: none; pointer-events: auto;
    }
    h1 {
      font-size: clamp(1.4rem, 4vw, 2.2rem); font-weight: 900;
      letter-spacing: 0.1em; text-transform: uppercase;
      margin: 0 0 1rem; color: #ff0033;
    }
    p { color: #666; max-width: 440px; line-height: 1.6; margin: 0; }
  `;

  const h1 = document.createElement('h1');
  h1.textContent = 'ACCESS_TERMINATED';
  const p = document.createElement('p');
  p.textContent = 'Developer Tools have been detected. This session has been suspended for security reasons.';
  const inner = document.createElement('div');
  inner.appendChild(h1);
  inner.appendChild(p);

  shadow.appendChild(style);
  shadow.appendChild(inner);
  document.documentElement.appendChild(host);

  // Lock page interaction at html level — survives overlay node removal.
  document.documentElement.style.pointerEvents = 'none';
  document.documentElement.style.userSelect = 'none';
  document.body.style.overflow = 'hidden';

  // CSS nuclear lock: hide all body content while detected.
  if (!document.getElementById('__devtools-lock__')) {
    const lockStyle = document.createElement('style');
    lockStyle.id = '__devtools-lock__';
    lockStyle.textContent = `body > * { display: none !important; visibility: hidden !important; }`;
    document.head.appendChild(lockStyle);
  }

  // MutationObserver: re-inject sentinel and CSS lock if removed.
  if (!_overlayObserver) {
    _overlayObserver = new MutationObserver(() => {
      if (!_isDetected) return;
      if (!document.getElementById('__devtools-sentinel__')) injectBreakOverlay();
      else if (!document.getElementById('__devtools-lock__')) {
        const lockStyle = document.createElement('style');
        lockStyle.id = '__devtools-lock__';
        lockStyle.textContent = `body > * { display: none !important; visibility: hidden !important; }`;
        document.head.appendChild(lockStyle);
      }
    });
    _overlayObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
}

/**
 * Removes the break overlay and restores page interaction.
 */
function removeBreakOverlay(): void {
  _isDetected = false;

  if (_overlayObserver) {
    _overlayObserver.disconnect();
    _overlayObserver = null;
  }

  document.getElementById('__devtools-sentinel__')?.remove();
  document.getElementById('__devtools-lock__')?.remove();

  document.documentElement.style.pointerEvents = '';
  document.documentElement.style.userSelect = '';
  document.body.style.overflow = '';
}

export const DevToolsDetectorPlugin: Plugin<[DevToolsPluginOptions?]> = {
  install(app: App, options: DevToolsPluginOptions = {}) {
    const { action = 'break', onOpen, onClose, productionOnly = false, ...detectorOptions } = options;

    // Skip plugin install in development when productionOnly is enabled.
    if (productionOnly && (import.meta as any)?.env?.DEV) return;

    // Reactive state for whether devtools are open.
    const isOpen: Ref<boolean> = ref(false);

    // Create detector and wire callback.
    const detector = new DevToolsDetector({
      ...detectorOptions,
      onChange(open) {
        isOpen.value = open;
        _isDetected = open;
        if (open) {
          onOpen?.();
          if (action === 'break') injectBreakOverlay();
        } else {
          onClose?.();
          if (action === 'break') removeBreakOverlay();
        }
      },
    });

    detector.start();

    // Provide plugin context via Vue injection.
    const ctx: DevToolsPluginContext = { isOpen: readonly(isOpen), detector };
    app.provide(DEVTOOLS_KEY, ctx);

    // Expose on global property for convenience (app.$devtools).
    app.config.globalProperties.$devtools = ctx;

    // Clean up polling when app unmounts.
    const originalUnmount = app.unmount;
    app.unmount = () => {
      detector.stop();
      removeBreakOverlay();
      originalUnmount?.();
    };
  },
};
