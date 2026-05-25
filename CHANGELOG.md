# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/).

### Unreleased

- feat(client): add retryOverTCP option #117
- feat(client): support `dns` argument, fix docs #116
- feat: add resolveSOA #115
- doc(README): add benchmark support #114
- feat: add typescript types file #113
- feat(packet): add RCODEs and usage docs #112
- feat(packet): add CAA decoding #111
- fix: reads across non-aligned bytes #111
- fix: avoid mutating in-place requests #111
- fix: avoid UTF8 corruption #111
- test: split tests into 3 files, add 45 new tests #108
- fix: drop mismatched IDs, filter senders, handle errs #104
- feat(client/doh): HTTP/2 transport #89
- feat(client/tcp): DNS-over-TLS support #88
- feat(packet): IPv6 subnet support in `EDNS.ECS.decode`
- feat(client/udp): configurable `timeout` (default 10s, `0` disables); rejects with `ETIMEDOUT`
- fix(client/udp): drop mismatched-id packets instead of crashing
- fix(client/udp): reject packets from non-resolver senders (port + IP literal via `net.isIP`)
- fix(client/udp): defensive `Packet.parse` — malformed strays are dropped, not rejected
- fix(client/udp): full 16-bit transaction ids via `crypto.randomInt`
- fix(client/udp): single cleanup with settled-guard; socket `error` is handled
- fix(client/tcp): empty response when server reply is async
- fix(client/doh): enforce RFC 8484 `dns` query parameter, drop invalid pathname auto-completion #95
- fix(server/udp): more resilient `udp4` default
- fix(packet): guard against ERR_BUFFER_OUT_OF_BOUNDS on malformed requests
- change(api): `resolve()` and UDP client take an options object (was `clientIp` positional) #84
- dep(eslint): upgrade to v10
- ci: modernize GitHub Actions workflows; add release.yml

### 2.1.0 - 2024-06-26

- feat(packet): DNSKEY record support
- feat(packet): RRSIG record support (decode only)
- feat(packet): `flatMap` support
- fix(packet): ensure compressed IPv6 is valid #70
- doc(README): correct `server.listen` options
