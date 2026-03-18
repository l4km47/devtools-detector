/**
 * DevTools Detector
 * Multi-strategy detection that works across Chrome, Firefox, Safari, Edge.
 */

/**
 * Detector strategies available.
 */
export type DetectorStrategy = 'size' | 'debugger' | 'console-profile' | 'firebug' | 'toString';

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
  strategies: ['size', 'debugger', 'console-profile', 'firebug', 'toString'],
  onChange: () => { },
  warningMessage: 'DevTools detected. This action has been logged.',
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
 */
function detectByToString(): boolean {
  let detected = false;
  const element = new Image();
  Object.defineProperty(element, 'id', {
    get() {
      detected = true;
    },
  });
  console.log('%c', element as unknown as string);
  return detected;
}

/**
 * Detect using console.profile/console.profileEnd timing behavior (if available).
 */
function detectByConsoleProfile(): boolean {
  let detected = false;
  const start = performance.now();

  if (typeof (console as any).profile === 'function') { //this is for bypass lint error for .profile method which is not in console typings
    (console as any).profile('__devtools_probe__');
    (console as any).profileEnd('__devtools_probe__');
  }

  const elapsed = performance.now() - start;
  if (elapsed > 10) detected = true;
  return detected;
}

function detectByFirebug(): boolean {
  return !!(window.console as unknown as Record<string, unknown>)?.['firebug'];
}

/**
 * Detect using `debugger` latency when devtools is open.
 */
function detectByDebugger(): boolean {
  let detected = false;
  const before = performance.now();
  debugger;
  const after = performance.now();
  if (after - before > 100) detected = true;
  return detected;
}

/**
 * Main detector class that orchestrates strategies and periodic checks.
 */
export class DevToolsDetector {
  private options: Required<DevToolsDetectorOptions>;
  private isOpen = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: DevToolsDetectorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Run all enabled strategies and compute whether devtools is open.
   */
  private runStrategies(): boolean {
    const { strategies, sizeThreshold } = this.options;
    const results: boolean[] = [];

    if (strategies.includes('size')) results.push(detectBySize(sizeThreshold));
    if (strategies.includes('toString')) {
      try { results.push(detectByToString()); } catch { }
    }
    if (strategies.includes('console-profile')) {
      try { results.push(detectByConsoleProfile()); } catch { }
    }
    if (strategies.includes('firebug')) results.push(detectByFirebug());
    if (strategies.includes('debugger')) results.push(detectByDebugger());

    // majority vote: at least half the enabled strategies must detect open.
    const positives = results.filter(Boolean).length;
    const threshold = Math.max(1, Math.floor(results.length / 2));
    return positives >= threshold;
  }

  /**
   * Check detector state and notify change callback when open state changes.
   */
  private check(): void {
    const open = this.runStrategies();
    if (open !== this.isOpen) {
      this.isOpen = open;
      this.options.onChange(open);
      if (open) this.printWarning();
    }
  }

  /**
   * Print styled console warning to make detection visible in logs.
   */
  private printWarning(): void {
    const msg = this.options.warningMessage;
    console.log('%c' + msg,
      [
        'background: #ff0033',
        'color: #ffffff',
        'font-size: 16px',
        'font-weight: bold',
        'padding: 12px 24px',
        'border-radius: 4px',
        'display: block',
      ].join(';')
    );

    console.log('%c⚠️ This is a browser feature for developers. If someone told you to paste something here, it is a scam.',
      'color: #ff6b35; font-size: 13px; font-weight: 600;');
    console.trace('%cDevTools opened – stack trace:', 'color: #888; font-size: 11px;');
  }

  /**
   * Start polling detector periodically.
   */
  start(): this {
    if (this.timer) return this;
    this.check();
    this.timer = setInterval(() => this.check(), this.options.pollInterval);
    return this;
  }

  /** Stop polling. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Current detected open state. */
  get detected(): boolean {
    return this.isOpen;
  }
}
