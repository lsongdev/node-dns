
### 2026-05-26

- client/udp.js refactors
  1. Mismatched ids are dropped and the listener keeps waiting — stray packets no longer crash the process.
  2. Sender filtering. Reject any packet whose rinfo.port isn't the configured resolver port; additionally enforce rinfo.address when dns is an IP literal (using net.isIP).
  3. Defensive Packet.parse. Wrapped in try/catch so a malformed stray packet doesn't reject the promise — it's dropped with a debug log.
  4. Timeout. New timeout option (default 10s, set 0 to disable). On expiry the promise rejects with code: 'ETIMEDOUT'. Timer is .unref()-ed so it never holds the event loop open.
  5. Full 16-bit transaction IDs. query.header.id = crypto.randomInt(0x10000), 6.5× the keyspace and uses a CSPRNG.
  6. Proper cleanup. Single cleanup() clears the timer, removes both listeners, and closes the socket; settled guard prevents double-resolve/reject from racing message + timeout.
  7. Error event handled. Socket errors now reject the promise instead of going unhandled.

