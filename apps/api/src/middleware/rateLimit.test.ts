import { describe, expect, it } from 'vitest';
import { WindowCounter } from './rateLimit';

describe('WindowCounter', () => {
  it('allows up to max hits per window, then blocks with a retry time', () => {
    let t = 1_000;
    const c = new WindowCounter(60_000, 3, () => t);
    expect(c.hit('a').allowed).toBe(true);
    expect(c.hit('a').allowed).toBe(true);
    expect(c.hit('a').allowed).toBe(true);
    const blocked = c.hit('a');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(60);
    t += 30_000;
    expect(c.hit('a').retryAfterSec).toBe(30);
  });

  it('counts each client separately and resets after the window', () => {
    let t = 0;
    const c = new WindowCounter(1_000, 1, () => t);
    expect(c.hit('a').allowed).toBe(true);
    expect(c.hit('a').allowed).toBe(false);
    expect(c.hit('b').allowed).toBe(true);
    t = 1_001;
    expect(c.hit('a').allowed).toBe(true);
  });

  it('sweeps expired windows', () => {
    let t = 0;
    const c = new WindowCounter(1_000, 1, () => t);
    c.hit('a');
    t = 2_000;
    c.sweep();
    expect(c.hit('a').allowed).toBe(true);
  });
});
