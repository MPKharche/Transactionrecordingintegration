import type Redis from "ioredis";

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export class CircuitOpenError extends Error {
  constructor(public readonly breakerName: string) {
    super(`Circuit breaker "${breakerName}" is OPEN`);
    this.name = "CircuitOpenError";
  }
}

interface CircuitBreakerOptions {
  failureThreshold: number;
  openDurationMs: number;
}

interface StoredState {
  state: CircuitState;
  failures: number;
  openedAt?: number;
}

export class CircuitBreaker {
  private localState: CircuitState = "CLOSED";
  private localFailures = 0;
  private localOpenedAt?: number;

  constructor(
    private readonly name: string,
    private readonly redis: Redis,
    private readonly options: CircuitBreakerOptions
  ) {}

  private key(): string {
    return `circuit:${this.name}`;
  }

  private async loadState(): Promise<StoredState> {
    const raw = await this.redis.get(this.key());
    if (!raw) {
      return { state: this.localState, failures: this.localFailures, openedAt: this.localOpenedAt };
    }
    try {
      return JSON.parse(raw) as StoredState;
    } catch {
      return { state: "CLOSED", failures: 0 };
    }
  }

  private async saveState(state: StoredState): Promise<void> {
    this.localState = state.state;
    this.localFailures = state.failures;
    this.localOpenedAt = state.openedAt;
    await this.redis.set(
      this.key(),
      JSON.stringify(state),
      "PX",
      this.options.openDurationMs * 4
    );
  }

  getState(): CircuitState {
    return this.localState;
  }

  async resolveState(): Promise<CircuitState> {
    const stored = await this.loadState();
    if (stored.state === "OPEN" && stored.openedAt) {
      const elapsed = Date.now() - stored.openedAt;
      if (elapsed >= this.options.openDurationMs) {
        await this.saveState({ state: "HALF_OPEN", failures: stored.failures, openedAt: stored.openedAt });
        return "HALF_OPEN";
      }
    }
    await this.saveState(stored);
    return stored.state;
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    const state = await this.resolveState();
    if (state === "OPEN") {
      throw new CircuitOpenError(this.name);
    }

    try {
      const result = await fn();
      await this.saveState({ state: "CLOSED", failures: 0 });
      return result;
    } catch (err) {
      const stored = await this.loadState();
      const failures = stored.failures + 1;
      if (stored.state === "HALF_OPEN" || failures >= this.options.failureThreshold) {
        await this.saveState({ state: "OPEN", failures, openedAt: Date.now() });
      } else {
        await this.saveState({ state: stored.state === "HALF_OPEN" ? "OPEN" : "CLOSED", failures, openedAt: stored.openedAt });
      }
      throw err;
    }
  }

  async forceClose(): Promise<void> {
    await this.saveState({ state: "CLOSED", failures: 0 });
  }
}

export function createZohoCircuitBreaker(redis: Redis): CircuitBreaker {
  return new CircuitBreaker("zoho-books", redis, {
    failureThreshold: 5,
    openDurationMs: 30 * 60 * 1000,
  });
}
