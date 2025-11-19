import { sleep } from '../utils/helpers';

type Task<T> = () => Promise<T>;

export class UpstreamRateLimiter {
  private tokens: number;
  private capacity: number;
  private refillIntervalMs: number;
  private refillAmount: number;
  private queue: Array<{
    task: Task<any>;
    resolve: (v: any) => void;
    reject: (e: any) => void;
  }> = [];
  private concurrent = 0;
  private concurrencyLimit: number;

  constructor(ratePerMinute: number, burst: number = 1, concurrency: number = 5) {
    this.capacity = Math.max(burst, Math.ceil(ratePerMinute / 60));
    this.tokens = this.capacity;
    this.refillIntervalMs = 1000; // refill per second
    this.refillAmount = ratePerMinute / 60 / (1000 / this.refillIntervalMs);
    this.concurrencyLimit = concurrency;
    setInterval(() => this.refill(), this.refillIntervalMs);
  }

  private refill() {
    this.tokens = Math.min(this.capacity, this.tokens + this.refillAmount);
    this.processQueue();
  }

  private processQueue() {
    while (this.queue.length > 0 && this.tokens >= 1 && this.concurrent < this.concurrencyLimit) {
      const item = this.queue.shift()!;
      this.execute(item.task, item.resolve, item.reject);
    }
  }

  private async execute(task: Task<any>, resolve: (v: any) => void, reject: (e: any) => void) {
    if (this.tokens < 1 || this.concurrent >= this.concurrencyLimit) {
      // requeue
      this.queue.unshift({ task, resolve, reject });
      return;
    }
    this.tokens -= 1;
    this.concurrent += 1;
    try {
      const result = await task();
      resolve(result);
    } catch (e) {
      // On error we wait a bit (simple backoff) and reject to caller
      await sleep(200);
      reject(e);
    } finally {
      this.concurrent -= 1;
      this.processQueue();
    }
  }

  schedule<T>(task: Task<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processQueue();
    });
  }
}

export default UpstreamRateLimiter;
