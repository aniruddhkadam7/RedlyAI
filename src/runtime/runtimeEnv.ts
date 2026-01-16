export type RuntimeEnv = {
  isDesktop: boolean;
  isWeb: boolean;
  density: 'compact' | 'normal';
};

const detectRuntimeEnv = (): RuntimeEnv => {
  const isDesktop = typeof window !== 'undefined' && !!window.eaDesktop;
  return {
    isDesktop,
    isWeb: !isDesktop,
    density: isDesktop ? 'compact' : 'normal',
  };
};

export const runtimeEnv: RuntimeEnv = detectRuntimeEnv();
