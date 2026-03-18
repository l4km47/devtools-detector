# @alpha/devtools-detector
## TL;DR Side quest from my web-project. so i though its gonna be reusable and healpfull

![CI](https://github.com/l4km47/devtools-detector/actions/workflows/ci.yml/badge.svg)
[![Socket Badge](https://badge.socket.dev/npm/package/@l4km47/devtools-detector/0.1.4)](https://badge.socket.dev/npm/package/@l4km47/devtools-detector/0.1.4)


A Vue 3 plugin for detecting browser devtools and optionally showing a break overlay or custom handlers.

## CI Status

This repository includes GitHub Actions CI that runs on push and pull request to `main`.

## Install

From your app:

```bash
npm install @alpha/devtools-detector
```

For local development (monorepo):

```bash
npm install --save-dev file:../devtools-detector
```

## Usage

```ts
import { createApp } from 'vue';
import App from './App.vue';
import { DevToolsDetectorPlugin } from '@alpha/devtools-detector';

const app = createApp(App);

app.use(DevToolsDetectorPlugin, {
  action: 'break',
  pollInterval: 800,
  strategies: ['toString', 'console-profile', 'firebug'],
  warningMessage: 'DevTools detected. This action has been logged.',
  onOpen: () => {
    console.log('DevTools opened');
  },
  onClose: () => {
    console.log('DevTools closed');
  },
  productionOnly: import.meta.env.PROD,
});

app.mount('#app');
```

## Composable

```ts
import { useDevTools } from '@alpha/devtools-detector';

export default {
  setup() {
    const { isOpen } = useDevTools();

    watch(isOpen, (open) => {
      if (open) {
        console.warn('Devtools are open');
      }
    });
  },
};
```

## API

### `DevToolsDetectorPlugin`

- ...

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, contribution workflow, and pull request process.

- `action: 'break' | 'warn' | 'custom'` (default `'break'`)
- `onOpen?: () => void`
- `onClose?: () => void`
- `productionOnly?: boolean`
- `pollInterval?: number` (default `1000`)
- `strategies?: DetectorStrategy[]`
- `warningMessage?: string`
- `sizeThreshold?: number`

### `useDevTools()`

Returns:
- `isOpen: Readonly<Ref<boolean>>`
- `detector: DevToolsDetector`
