# dns2 

### Performance and Benchmarking

#### Running the benchmark

A UDP throughput benchmark is included. It starts an in-process echo server,
fires queries at it, and reports RPS and latency percentiles:

```bash
node benchmark/udp.js

# Tune via env vars
TOTAL=50000 CONCURRENCY=200 node benchmark/udp.js

# Target an external server
DNS=127.0.0.1:5353 node benchmark/udp.js
```

Example output on a modern laptop (single Node.js process, loopback UDP):

```
Sending 10000 queries at concurrency 100...

Results
-------
  Total queries : 10000
  Errors        : 0
  Wall time     : 812 ms
  Throughput    : 12315 req/s

  Latency (ms)
    min  : 0
    mean : 7.92
    p50  : 7
    p90  : 13
    p99  : 24
    max  : 61
```

#### Limiting concurrency with `maxConcurrent`

Use the `maxConcurrent` option on `createServer` to cap how many handler
invocations can be in flight simultaneously. Requests that arrive when the limit
is already reached receive an immediate `SERVFAIL` response rather than queuing
unboundedly.

```js
const server = dns2.createServer({
  udp          : true,
  maxConcurrent: 500,   // at most 500 handler calls in flight at once
  handle(request, send) {
    // async work here...
  },
});
```

> **Note:** handlers must always call `send()` — the active-request counter
> decrements only when `send()` is invoked. A handler that never calls `send()`
> will permanently consume one concurrency slot.

#### Node.js tuning tips

- Run multiple worker processes with the built-in
  [`cluster`](https://nodejs.org/api/cluster.html) module to use all CPU cores.
- Increase the V8 new-space size to reduce minor-GC frequency under high load:
  `node --max-semi-space-size=64 server.js`
- For production, consider a process manager (PM2, systemd) that auto-restarts
  on failure and enables multi-instance clustering.

