import { defaultConfig } from 'antd/lib/theme/internal';

// In tests, disable rc-motion animations (used by antd notifications).
// This avoids async animation callbacks that can trigger act() warnings and keep Jest alive.
jest.mock('@rc-component/motion', () => {
  const React = require('react');

  const CSSMotion = (props) => {
    const child = props?.children;
    if (typeof child === 'function') {
      return child({ className: '', style: {}, ref: () => {} });
    }
    return child ?? null;
  };

  const CSSMotionList = (props) => {
    const child = props?.children;
    if (typeof child === 'function') {
      // Provide minimal shape expected by callers; intentionally do NOT invoke onAllRemoved.
      return React.createElement(React.Fragment, null, child({}));
    }
    return React.createElement(React.Fragment, null, child ?? null);
  };

  return {
    __esModule: true,
    default: CSSMotion,
    CSSMotion,
    CSSMotionList,
  };
});

defaultConfig.hashed = false;

const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

global.localStorage = localStorageMock;

if (typeof global.MessageChannel === 'undefined') {
  // rc-field-form uses MessageChannel for scheduling in some environments.
  try {
    // eslint-disable-next-line global-require
    const { MessageChannel } = require('worker_threads');
    global.MessageChannel = MessageChannel;
  } catch {
    // Fallback: very small polyfill that satisfies the API shape.
    global.MessageChannel = class MessageChannelPolyfill {
      constructor() {
        this.port1 = { onmessage: null, postMessage: () => {} };
        this.port2 = { onmessage: null, postMessage: () => {} };
      }
    };
  }
}

Object.defineProperty(URL, 'createObjectURL', {
  writable: true,
  value: jest.fn(),
});

class Worker {
  constructor(stringUrl) {
    this.url = stringUrl;
    this.onmessage = () => {};
  }

  postMessage(msg) {
    this.onmessage(msg);
  }
}
window.Worker = Worker;

if (typeof window !== 'undefined') {
  // ref: https://github.com/ant-design/ant-design/issues/18774
  if (!window.matchMedia) {
    Object.defineProperty(global.window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: jest.fn(() => ({
        matches: false,
        addListener: jest.fn(),
        removeListener: jest.fn(),
      })),
    });
  }
  if (!window.matchMedia) {
    Object.defineProperty(global.window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: jest.fn((query) => ({
        matches: query.includes('max-width'),
        addListener: jest.fn(),
        removeListener: jest.fn(),
      })),
    });
  }
}
const errorLog = console.error;
Object.defineProperty(global.window.console, 'error', {
  writable: true,
  configurable: true,
  value: (...rest) => {
    const logStr = rest.join('');
    if (
      logStr.includes(
        'Warning: An update to %s inside a test was not wrapped in act(...)',
      )
    ) {
      return;
    }
    if (logStr.includes('An update to') && logStr.includes('inside a test was not wrapped in act(...)')) {
      return;
    }
    errorLog(...rest);
  },
});

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
