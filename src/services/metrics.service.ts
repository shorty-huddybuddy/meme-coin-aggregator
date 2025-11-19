class MetricsService {
  private counters: Record<string, number> = {
    requests: 0,
    rateLimitEvents: 0,
    authFailures: 0,
  };

  increment(key: keyof typeof this.counters, by = 1): void {
    if (!this.counters[key]) this.counters[key] = 0;
    this.counters[key] += by;
  }

  getAll(): Record<string, number> {
    return { ...this.counters };
  }
}

export const metrics = new MetricsService();

export default metrics;
