# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/).

### Unreleased

- feat(packet): encode name compression pointers (RFC 1035 §4.1.4)
- feat(server/udp): negotiated UDP payload size with TC=1 on oversize
- feat(server/tcp): pipeline support (RFC 7766 §6.2.1.1)
- feat(packet): EDNS extended RCODE supported
- fix(packet): EDNS default UDP payload size raised to 4096
- fix(packet): clamps TTLs to 2³¹−1
- fix(packet): Label and name length validation (RFC 1035 §2.3.4)
- fix(server/doh): accepts any (or absent) Accept header (RFC 8484 §4.1)
- fix(server/doh): DoH POST requires Content-Type: application/dns-message
- feat(server/doh): DoH responses include TTL-derived Cache-Control
- fix(packet): Packet.Header.toBuffer writes Z=0 (RFC 1035 §4.1.1)

### [2.3.0] - 2026-05-25

- fix(packet): IPv6 `::` compression for leading-zero address #123
- fix(packet): Name decode rejects pointer cycles (RFC 1035) #124
- fix(packet): EDNS exposes extendedRcode/version/doFlag #124
- fix(packet): Header initializes ancount; AD/CD bits split from Z (RFC 4035) #124
- fix(packet): ECS encoder truncates address, adds IPv6 (RFC 7871) #124
- feat(server): PROXY protocol v1/v2 support #122

### [2.2.1] - 2026-05-25

- fix(packet): use crypto.randomInt for Packet.uuid (RFC 5452)
- fix(packet): preserve RDLENGTH+RDATA for unknown RR types

### [2.2.0] - 2026-05-25

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

[2.3.0]: https://github.com/lsongdev/node-dns/releases/tag/v2.3.0
[2.2.0]: https://github.com/lsongdev/node-dns/releases/tag/v2.2.0
[2.2.1]: https://github.com/lsongdev/node-dns/releases/tag/v2.2.1
