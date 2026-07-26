const { inspect } = require('util');

// A test that never settles used to stall the chain silently: with nothing left
// in the event loop the process exits 0, `node --test` scores the file as a
// pass, and every test after the stalled one is never run. Two guards: each
// test races a timer, and exiting with tests still pending fails the file.
const DEFAULT_TIMEOUT = Number(process.env.TEST_TIMEOUT) || 10000;

let previous = Promise.resolve();
let pending = 0;

const withTimeout = (fn, title, ms) => {
  let timer;
  return Promise.race([
    // .then(fn) so a synchronous throw is captured as a rejection too.
    Promise.resolve().then(fn),
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`timed out after ${ms}ms — did not settle`)),
        ms,
      );
    }),
    // A cleared timer must not keep the loop alive after a test passes.
  ]).finally(() => clearTimeout(timer));
};

/**
 * super tiny testing framework
 *
 * @author Liu song <hi@lsong.org>
 * @github https://github.com/song940/node-dns
 */
const test = (title, fn, { timeout = DEFAULT_TIMEOUT } = {}) => {
  pending++;
  previous = previous.then(async () => {
    try {
      await withTimeout(fn, title, timeout);
      pending--;
      console.log(color(` ✔  ${title}`, 32));
    } catch (err) {
      console.error(color(` ✘  ${title}`, 31));
      console.log();
      console.log(color(`   ${err.name}: ${err.message}`, 31));
      if ('expected' in err || 'actual' in err) {
        console.error(color(`   expected: ${inspect(err.expected)}`, 32));
        console.error(color(`     actual: ${inspect(err.actual)}`, 31));
      }
      console.log(err.stack);
      console.log();
      // The failure is already reported; don't also claim tests went missing.
      pending = 0;
      process.exit(1);
    }
  });
  return previous;
};

function color(str, c) {
  return `\x1b[${c}m${str}\x1b[0m`;
}

test.skip = (title, _fn) => {
  previous = previous.then(() => {
    console.log(color(` ⊘  ${title} (skipped)`, 33));
  });
  return previous;
};

// Backstop for anything the per-test timer cannot catch — a stray process.exit,
// or the event loop draining between tests.
process.on('exit', () => {
  if (pending === 0) return;
  console.error(
    color(`   ✘  ${pending} test(s) did not run to completion`, 31),
  );
  if (!process.exitCode) process.exitCode = 1;
});

module.exports = test;
