// Realtime-driven refetches arrive in bursts, not one at a time.
//
// Placing a single pooled order writes to `sales`, `sale_items`, `inventory`,
// `inventory_transactions` and (for a debt order) `debts` — five tables, so
// five separate postgres_changes events. Every hook subscribed to any of them
// ran one full refetch *per event*. `useDailyReport` listens to seventeen
// tables and each refetch is a Promise.all of ~20 unbounded selects, so one
// order could kick off a hundred queries at once. On a weak connection those
// queue behind each other and the UI sits blank until the last one lands.
//
// coalesceRefetch collapses a burst into a single trailing refetch and
// guarantees only one is ever in flight; events that arrive mid-flight schedule
// exactly one follow-up rather than piling up.
export function coalesceRefetch(fn, delay = 350) {
  let timer = null;
  let running = false;
  let queued = false;
  let cancelled = false;

  const run = async () => {
    if (cancelled) return;
    // Something arrived while a refetch was in flight — remember to run once
    // more when it settles, so the final state is never stale.
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      await fn();
    } catch {
      // Callers already log their own failures. Swallowing here keeps one bad
      // response from breaking the timer chain for the rest of the session.
    } finally {
      running = false;
      if (queued && !cancelled) {
        queued = false;
        trigger();
      }
    }
  };

  const trigger = () => {
    if (cancelled) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      run();
    }, delay);
  };

  // Must be called from the effect cleanup: without it a pending timer fires
  // after unmount and calls setState on a dead component.
  trigger.cancel = () => {
    cancelled = true;
    queued = false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return trigger;
}
