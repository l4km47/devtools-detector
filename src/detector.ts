/**
 * DevTools Detector
 * Multi-strategy detection that works across Chrome, Firefox, Safari, Edge.
 */

// Capture native browser APIs before any user code can override them.
// Must execute before any other scripts to ensure genuine native refs.
const _native = (() => ({
  consoleLog: console.log.bind(console),
  defineProperty: Object.defineProperty.bind(Object),
  perfNow: performance.now.bind(performance),
  fnToString: Function.prototype.toString,
  setInterval: window.setInterval.bind(window),
  clearInterval: window.clearInterval.bind(window),
}))();

/**
 * Detector strategies available.
 */
export type DetectorStrategy =
  | 'size'
  | 'debugger'
  | 'console-profile'
  | 'firebug'
  | 'toString'
  | 'tamper'
  | 'worker';

/**
 * Options for the detector.
 */
export interface DevToolsDetectorOptions {
  /** Poll interval (ms) to re-check detection. */
  pollInterval?: number;
  /** Strategies to run. */
  strategies?: DetectorStrategy[];
  /** Callback when open/close state changes. */
  onChange?: (isOpen: boolean) => void;
  /** Console warning message shown after detection. */
  warningMessage?: string;
  /** Pixel threshold for size-based detection. */
  sizeThreshold?: number;
}

// Default settings for the detector.
const DEFAULT_OPTIONS: Required<DevToolsDetectorOptions> = {
  pollInterval: 1000,
  strategies: ['size', 'debugger', 'console-profile', 'firebug', 'toString', 'tamper', 'worker'],
  onChange: () => { },
  warningMessage: 'STOP.',
  sizeThreshold: 160,
};

/**
 * Detect via window size differences (common when devtools docked/undocked).
 */
function detectBySize(threshold: number): boolean {
  const widthDelta = window.outerWidth - window.innerWidth;
  const heightDelta = window.outerHeight - window.innerHeight;
  return widthDelta > threshold || heightDelta > threshold;
}

/**
 * Detect using console logging and Object.defineProperty to trigger getter behavior.
 * Uses captured native refs — immune to console.log/defineProperty overrides.
 */
function detectByToString(): boolean {
  let detected = false;
  const element = new Image();
  _native.defineProperty(element, 'id', {
    get() {
      detected = true;
    },
  });
  _native.consoleLog('%c', element as unknown as string);
  return detected;
}

/**
 * Detect using console.profile/console.profileEnd timing behavior (if available).
 * Uses captured native performance.now — immune to timing overrides.
 */
function detectByConsoleProfile(): boolean {
  const start = _native.perfNow();

  if (typeof (console as any).profile === 'function') { //this is for bypass lint error for .profile method which is not in console typings
    (console as any).profile('__devtools_probe__');
    (console as any).profileEnd('__devtools_probe__');
  }

  return _native.perfNow() - start > 10;
}

function detectByFirebug(): boolean {
  return !!(window.console as unknown as Record<string, unknown>)?.['firebug'];
}

/**
 * Detect using `debugger` latency when devtools is open.
 * Uses captured native performance.now — immune to timing overrides.
 */
function detectByDebugger(): boolean {
  const before = _native.perfNow();
  debugger;
  return _native.perfNow() - before > 100;
}

/**
 * Detect native API tampering.
 * If console.log, Object.defineProperty, or performance.now are no longer native,
 * someone overrode them — treat the override itself as a tampering/devtools signal.
 */
function detectByTamper(): boolean {
  const targets = [console.log, Object.defineProperty, performance.now];
  return targets.some((fn) => {
    try {
      return !_native.fnToString.call(fn).includes('[native code]');
    } catch {
      // Proxy trap fired during toString — function is wrapped
      return true;
    }
  });
}

/**
 * Runs debugger timing inside an isolated Worker thread.
 * Worker's performance.now cannot be patched by page-level JS.
 */
function detectByWorker(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const src = `self.onmessage=function(){var t=performance.now();debugger;self.postMessage(performance.now()-t);};`;
      const blob = new Blob([src], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url);
      let settled = false;

      const settle = (val: boolean) => {
        if (settled) return;
        settled = true;
        resolve(val);
        worker.terminate();
        URL.revokeObjectURL(url);
      };

      worker.onmessage = (e: MessageEvent<number>) => settle(e.data > 100);
      worker.onerror = () => settle(false);
      setTimeout(() => settle(false), 300);
      worker.postMessage(null);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Main detector class that orchestrates strategies and periodic checks.
 */
export class DevToolsDetector {
  private options: Required<DevToolsDetectorOptions>;
  private isOpen = false;
  private timer: number | null = null;
  private checking = false;
  private pendingWorker = false;

  constructor(options: DevToolsDetectorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Run all enabled strategies and compute whether devtools is open.
   */
  private async runStrategies(): Promise<boolean> {
    const { strategies, sizeThreshold } = this.options;
    const results: boolean[] = [];

    if (strategies.includes('size')) results.push(detectBySize(sizeThreshold));
    if (strategies.includes('tamper')) results.push(detectByTamper());
    if (strategies.includes('toString')) {
      try { results.push(detectByToString()); } catch { }
    }
    if (strategies.includes('console-profile')) {
      try { results.push(detectByConsoleProfile()); } catch { }
    }
    if (strategies.includes('firebug')) results.push(detectByFirebug());
    if (strategies.includes('debugger')) results.push(detectByDebugger());
    if (strategies.includes('worker') && !this.pendingWorker) {
      this.pendingWorker = true;
      try {
        results.push(await detectByWorker());
      } finally {
        this.pendingWorker = false;
      }
    }

    // majority vote: at least half the enabled strategies must detect open.
    const positives = results.filter(Boolean).length;
    const threshold = Math.max(1, Math.floor(results.length / 2));
    return positives >= threshold;
  }

  /**
   * Check detector state and notify change callback when open state changes.
   * Guards against overlapping async checks.
   */
  private async check(): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    try {
      const open = await this.runStrategies();
      if (open !== this.isOpen) {
        this.isOpen = open;
        this.options.onChange(open);
        if (open) this.printWarning();
      }
    } finally {
      this.checking = false;
    }
  }

  /**
   * Print styled console warning to make detection visible in logs.
   * Uses captured native console.log — immune to console overrides.
   */
  private printWarning(): void {
    const msg = this.options.warningMessage;
    _native.consoleLog(
      '%c' + msg,
      [
        'background: #ff0033',
        'color: #ffffff',
        'font-size: 36px',
        'font-weight: bold',
        'padding: 12px 24px',
        'border-radius: 4px',
        'display: block',
      ].join(';'),
    );

    _native.consoleLog(
      '%cThis is a browser feature for developers. If someone told you to paste something here, it is a scam.',
      'color: #ff6b35; font-size: 13px; font-weight: 600;',
    );
    console.trace('%cDevTools opened - stack trace:', 'color: #888; font-size: 11px;');
  }

  /**
   * Start polling detector periodically.
   */
  start(): this {
    if (this.timer) return this;
    this.check();
    this.timer = _native.setInterval(() => this.check(), this.options.pollInterval);
    return this;
  }

  /** Stop polling. */
  stop(): void {
    if (this.timer) {
      _native.clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Current detected open state. */
  get detected(): boolean {
    return this.isOpen;
  }
}
