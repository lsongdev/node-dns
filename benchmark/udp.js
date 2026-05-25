#!/usr/bin/env node
/**
 * UDP benchmark — measures dns2 server throughput and latency.
 *
 * Usage:
 *   node benchmark/udp.js
 *
 * Environment variables:
 *   TOTAL       – number of queries to send   (default: 10 000)
 *   CONCURRENCY – max in-flight queries        (default: 100)
 *   DNS         – host:port of an external server to target instead of the
 *                 built-in echo server (e.g. DNS=127.0.0.1:5353)
 */
'use strict';

const { createServer, UDPClient, Packet } = require('..');

const TOTAL = parseInt(process.env.TOTAL || '10000', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '100', 10);
const DNS_TARGET = process.env.DNS || null;

function percentile(sorted, p) {
  return sorted[Math.max(0, Math.floor(sorted.length * p / 100) - 1 + (p === 100 ? 1 : 0))];
}

async function run() {
  let server = null;
  let port;
  let host = '127.0.0.1';

  if (DNS_TARGET) {
    const parts = DNS_TARGET.split(':');
    host = parts[0];
    port = parseInt(parts[1], 10);
    console.log(`Targeting external server ${host}:${port}`);
  } else {
    server = createServer({
      udp: true,
      handle(request, send) {
        const response = Packet.createResponseFromRequest(request);
        const [ q ] = request.questions;
        response.answers.push({
          name    : q.name,
          type    : Packet.TYPE.A,
          class   : Packet.CLASS.IN,
          ttl     : 60,
          address : '127.0.0.1',
        });
        send(response);
      },
    });
    const addresses = await server.listen();
    port = addresses.udp.port;
    console.log(`In-process echo server on 127.0.0.1:${port}`);
  }

  const client = UDPClient({ dns: host, port });

  console.log(`Sending ${TOTAL} queries at concurrency ${CONCURRENCY}...\n`);

  const latencies = new Array(TOTAL);
  let completed = 0;
  let errors = 0;

  const wallStart = Date.now();

  await new Promise((resolve) => {
    let sent = 0;
    let inFlight = 0;

    function next() {
      while (inFlight < CONCURRENCY && sent < TOTAL) {
        const idx = sent++;
        inFlight++;
        const t0 = Date.now();
        client('benchmark.test', 'A')
          .then(() => {
            latencies[idx] = Date.now() - t0;
          })
          .catch(() => {
            latencies[idx] = Date.now() - t0;
            errors++;
          })
          .finally(() => {
            inFlight--;
            completed++;
            if (completed === TOTAL) resolve();
            else next();
          });
      }
    }

    next();
  });

  const wallMs = Date.now() - wallStart;
  const rps = Math.round(TOTAL / (wallMs / 1000));

  const sorted = latencies.slice().sort((a, b) => a - b);
  const mean = (sorted.reduce((s, v) => s + v, 0) / sorted.length).toFixed(2);

  console.log('Results');
  console.log('-------');
  console.log(`  Total queries : ${TOTAL}`);
  console.log(`  Errors        : ${errors}`);
  console.log(`  Wall time     : ${wallMs} ms`);
  console.log(`  Throughput    : ${rps} req/s`);
  console.log('');
  console.log('  Latency (ms)');
  console.log(`    min  : ${sorted[0]}`);
  console.log(`    mean : ${mean}`);
  console.log(`    p50  : ${percentile(sorted, 50)}`);
  console.log(`    p90  : ${percentile(sorted, 90)}`);
  console.log(`    p99  : ${percentile(sorted, 99)}`);
  console.log(`    max  : ${sorted[sorted.length - 1]}`);

  if (server) {
    await server.close();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
