import { DOHClient } from '../../index.mjs';

const resolve = DOHClient({ dns: 'https://cloudflare-dns.com/dns-query' });
const reply = await resolve('example.com', 'A');
console.log(reply.answers);
