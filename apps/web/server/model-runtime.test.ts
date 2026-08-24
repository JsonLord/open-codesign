import { describe, expect, it } from 'vitest';
import { extractJsx, readModelConfig, runtimeStatus } from './model-runtime.js';

describe('web model runtime', () => {
  it('reports a clear unconfigured state without exposing secrets', () => {
    const config = readModelConfig({});
    expect(config).toBeNull();
    expect(runtimeStatus('/app', config)).toEqual({
      ready: false,
      storageRoot: '/app',
      message: 'Set CODESIGN_PROVIDER, CODESIGN_MODEL, and CODESIGN_API_KEY to enable generation.',
    });
  });

  it('loads model configuration from Space secrets', () => {
    const config = readModelConfig({
      CODESIGN_PROVIDER: 'openai',
      CODESIGN_MODEL: 'gpt-5.2',
      CODESIGN_API_KEY: 'secret',
    });
    expect(runtimeStatus('/app', config)).toEqual({
      ready: true,
      storageRoot: '/app',
      model: { provider: 'openai', model: 'gpt-5.2' },
    });
  });

  it('extracts JSX without persisting model markdown fences', () => {
    expect(extractJsx('```jsx\nexport default function App() { return <main />; }\n```')).toBe(
      'export default function App() { return <main />; }\n',
    );
    expect(() => extractJsx('Here is your design')).toThrow('default-exported React component');
  });
});
