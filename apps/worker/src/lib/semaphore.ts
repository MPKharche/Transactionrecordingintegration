/** Lightweight async semaphore for stage-level backpressure. */
export function createSemaphore(max: number) {
  let active = 0;
  const waiters: Array<() => void> = [];

  async function acquire(): Promise<void> {
    if (active < max) {
      active++;
      return;
    }
    await new Promise<void>((resolve) => waiters.push(resolve));
    active++;
  }

  function release(): void {
    active--;
    const next = waiters.shift();
    if (next) next();
  }

  async function run<T>(fn: () => Promise<T>): Promise<T> {
    await acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  return { run, acquire, release };
}
