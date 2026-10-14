#!/usr/bin/env sage
"""CuRvE solver — V1T CTF 2026 (Crypto).

Bug: challenge()/sign/verify use E, G, priv_key as module globals that are
never assigned (missing `global`), so options 1/2/4 raise NameError until you
take option 3 "Change ECDSA parameters" (the only working path).

Attack:
  1. Reconnect + send option 3 with random 128-bit (a, b) until the server's
     new curve order n = smooth * q with 2^60 < q <= Q_MAX (default 2^62).
     - Bad n makes the SERVER hang inside factor()/Schoof: our socket timeout
       is the filter (abandon + retry). Good n returns fast.
     - Expect ~1/7000 attempts. Run many in parallel (see -P note below).
  2. Pohlig-Hellman: BSGS for factors <= 2^40, Pollard-rho for q.
     Single-thread rho on ~2^62 takes ~30-90 min; parallelise it (distinguished
     points) or lower Q_MAX to 2^61 for a faster, rarer hit.
  3. ECDSA-sign a fresh message with recovered priv, send option 4.

Usage:
    sage solve.py <host> <port> [--qmax 62] [--timeout 100]

Tip: parallelise the search with e.g.
    seq 1 40 | xargs -P 40 -I{} sage solve.py HOST PORT
first finisher prints the flag (each attempt is an independent connection).
"""

import hashlib
import random
import re
import signal
import socket
import sys
from math import gcd

from sage.all import GF, EllipticCurve, Integer

SMOOTH_BOUND = 2**40
ONE = 1

sys_rng = random.SystemRandom()


# ---------------------------------------------------------------- I/O
class Conn:
    def __init__(self, host, port, timeout):
        self.s = socket.create_connection((host, port), timeout=timeout)
        self.s.settimeout(timeout)
        self.buf = b""

    def recv_until(self, *markers, max_bytes=1 << 20):
        ms = [m.encode() if isinstance(m, str) else m for m in markers]
        while True:
            for m in ms:
                if m in self.buf:
                    out = self.buf.decode("utf-8", "replace")
                    self.buf = b""
                    return out
            chunk = self.s.recv(65536)
            if not chunk:
                out = self.buf.decode("utf-8", "replace")
                self.buf = b""
                return out
            self.buf += chunk
            if len(self.buf) > max_bytes:
                out = self.buf.decode("utf-8", "replace")
                self.buf = b""
                return out

    def sendline(self, data):
        if isinstance(data, str):
            data = data.encode()
        self.s.sendall(data + b"\n")

    def close(self):
        try:
            self.s.close()
        except OSError:
            pass


# ---------------------------------------------------------------- math
def bsgs_dlog(G, Q, order):
    """Additive BSGS: find x with x*G == Q, 0 <= x < order."""
    import math
    m = math.isqrt(int(order)) + 1
    table = {}
    acc = None  # identity placeholder; rebuilt per curve below
    raise NotImplementedError  # replaced by closure version (needs curve zero)


def make_ec_ops(E):
    Z = E(0)

    def add(A, B):
        return A + B

    def mul(k, Pt):
        return int(k) * Pt

    def neg(Pt):
        return -Pt

    def bsgs(G, Q, order):
        import math
        order = int(order)
        m = math.isqrt(order) + 1
        table = {}
        cur = Z
        for j in range(m):
            table[(int(cur.xy()[0]) if cur != Z else None,
                   int(cur.xy()[1]) if cur != Z else None)] = j
            cur = cur + G
        factor_step = m * G
        cur = Q
        for i in range(m + 1):
            key = (int(cur.xy()[0]) if cur != Z else None,
                   int(cur.xy()[1]) if cur != Z else None)
            if key in table:
                return (i * m + table[key]) % order
            cur = cur - factor_step
        raise ValueError("BSGS failed")

    def rho(Qpt, G, order):
        """Pollard rho (Floyd) for Qpt = d*G."""
        order = int(order)

        def step(state):
            a, b, Pt = state
            r = 0 if Pt == Z else int(Pt.xy()[0]) % 3
            if Pt == Z or r == 0:
                return ((a + 1) % order, b, Pt + G)
            if r == 1:
                return (a, (b + 1) % order, Pt + Qpt)
            return ((2 * a) % order, (2 * b) % order, Pt + Pt)

        tort = (1 % order, 0, G)
        hare = step(step((1 % order, 0, G)))
        while tort[2] != hare[2]:
            tort = step(tort)
            hare = step(step(hare))
        da = (tort[0] - hare[0]) % order
        db = (hare[1] - tort[1]) % order
        g = gcd(db, order)
        if da % g != 0:
            raise ValueError("rho collision unusable, retry")
        for k in range(g):
            cand = (pow(db // g, -1, order // g) * (da // g + k * (order // g))) % order
            if cand * G == Qpt:
                return cand
        raise ValueError("rho failed")

    return Z, add, mul, neg, bsgs, rho


def pohlig_hellman(E, G, Qpub, fac_ord, bsgs, rho, smooth=int(SMOOTH_BOUND)):
    """Recover d with d*G == Qpub given factorisation of ord(G)."""
    import math
    ordG = 1
    for ell, e in fac_ord.items():
        ordG *= ell**e
    d_res, d_mod = 0, 1
    for ell, e in fac_ord.items():
        pe = ell**e
        g_ell = (ordG // pe) * G
        q_ell = (ordG // pe) * Qpub
        if ell > smooth:  # the big prime -> rho
            d_ell = rho(q_ell, g_ell, pe)
        else:  # small prime power -> digit BSGS
            x, Qk = 0, q_ell
            base_ell = (ell ** (e - 1)) * g_ell  # order ell
            for k in range(e):
                h_k = (ell ** (e - 1 - k)) * Qk
                dk = bsgs(base_ell, h_k, ell)
                x += dk * ell**k
                Qk = Qk - (dk * ell**k) * g_ell
            d_ell = x % pe
        assert math.gcd(d_mod, pe) == 1
        inv = pow(d_mod, -1, pe)
        d_res = (d_res + d_mod * ((d_ell - d_res) * inv % pe)) % (d_mod * pe)
        d_mod *= pe
    return d_res % ordG


# ---------------------------------------------------------------- attempt
class Timeout(Exception):
    pass


def _alarm_handler(signum, frame):
    raise Timeout()


def factor_timeboxed(n, seconds):
    """Factor n, aborting after `seconds` (POSIX only)."""
    try:
        signal.signal(signal.SIGALRM, _alarm_handler)
        signal.alarm(seconds)
        try:
            return dict(factor(n))
        finally:
            signal.alarm(0)
    except Timeout:
        return None


def one_attempt(host, port, qmax, timeout, verbose=True):
    c = Conn(host, port, timeout)
    try:
        out = c.recv_until("Your choice:")
        c.sendline("3")
        out = c.recv_until("Prime p =", "OOPS", "Error", "Traceback")
        m = re.search(r"Prime p = (\d+)", out)
        if not m:
            return None  # cheated-assert or crash -> retry
        p = int(m.group(1))
        a = (1 << 127) | sys_rng.getrandbits(127)
        b = (1 << 127) | sys_rng.getrandbits(127)
        c.sendline(format(a, "x"))
        out = c.recv_until("Enter the coefficient b",
                           "OOPS", "Error", "Traceback")
        c.sendline(format(b, "x"))
        out = c.recv_until("New Public key:", "OOPS", "Error",
                           "Traceback", "AssertionError")
        if "New Public key:" not in out:
            return None
        gpub = re.search(r"New Public key: \('([^']+)', '([^']+)'\)", out)
        ggen = re.search(r"New Base point G: \(\('?([^',\)]+)'?, '?([^',\)]+)'?\)", out)
        gord = re.search(r"New Order of the curve: (\d+)", out)
        if not (gpub and ggen and gord):
            # still printing (Schoof slow) or order line pending; wait more
            out += c.recv_until("New Order of the curve:")
            gpub = re.search(r"New Public key: \('([^']+)', '([^']+)'\)", out)
            ggen = re.search(r"New Base point G: \(\('?([^',\)]+)'?, '?([^',\)]+)'?\)", out)
            gord = re.search(r"New Order of the curve: (\d+)", out)
            if not (gpub and ggen and gord):
                return None
        n = int(gord.group(1))
    except (socket.timeout, TimeoutError, OSError):
        c.close()
        return None

    # local form check (time-boxed: bad n hangs generic factor)
    fac = factor_timeboxed(n, 25)
    if not fac:
        c.close()
        return None
    big = [(qq, e) for qq, e in fac.items() if qq > SMOOTH_BOUND]
    if len(big) != 1 or big[0][1] != 1 or not (2**60 < big[0][0] <= qmax):
        c.close()
        return None
    if any(qq > SMOOTH_BOUND for qq, e in fac.items() if qq != big[0][0]):
        c.close()
        return None
    q = int(big[0][0])
    if verbose:
        print(f"[+] weak curve! nbits={n.bit_length()} q={q} "
              f"({len(fac)} factors)", flush=True)

    # rebuild curve locally (trust server's n)
    K = GF(p)
    E = EllipticCurve(K, [a, b])
    G = E(Integer(int(ggen.group(1), 0)), Integer(int(ggen.group(2), 0)))
    Qpub = E(Integer(int(gpub.group(1), 0)), Integer(int(gpub.group(2), 0)))
    Z, add, mul, neg, bsgs, rho = make_ec_ops(E)

    # order of G from known factorisation (no generic G.order() call)
    ordG = n
    for ell in list(fac):
        while ordG % ell == 0 and (ordG // ell) * G == Z:
            ordG //= ell
    fac_ord = {}
    tmp = ordG
    for ell in fac:
        e = 0
        while tmp % ell == 0:
            tmp //= ell
            e += 1
        if e:
            fac_ord[ell] = e
    assert tmp == 1, "order has unexpected factor"
    if verbose:
        print(f"[+] ord(G) bits={ordG.bit_length()}, factors={fac_ord}",
              flush=True)

    d = pohlig_hellman(E, G, Qpub, fac_ord, bsgs, rho)
    assert d * G == Qpub, "DLP check failed"
    print("[+] priv recovered", flush=True)

    # sign a fresh message (standard ECDSA) and pass the custom verify
    msg = sys_rng.randbytes(16).hex()
    for _ in range(100):
        k = sys_rng.randrange(1, ordG)
        Rk = k * G
        if Rk == Z:
            continue
        r = int(Rk.xy()[0])
        if r == 0 or r >= n:
            continue
        if gcd(k, ordG) != 1:
            continue
        h = int(hashlib.sha256(bytes.fromhex(msg)).hexdigest(), 16)
        s = (pow(k, -1, ordG) * (h + r * d)) % ordG
        if s == 0 or s >= n:
            continue
        break
    c.sendline("4")
    c.recv_until("Enter the message")
    c.sendline(msg)
    c.recv_until("Enter r")
    c.sendline(format(r, "x"))
    c.recv_until("Enter s")
    c.sendline(format(s, "x"))
    out = c.recv_until("v1t{", "Invalid", "Error", "Traceback")
    fm = re.search(r"v1t\{[^}]*\}", out)
    c.close()
    if fm:
        return fm.group(0)
    # server closes after exit(0); drain remaining bytes just in case
    return None


def main():
    host = sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1"
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 13237
    qbits = 62
    timeout = 100
    for a in sys.argv[3:]:
        if a.startswith("--qmax"):
            qbits = int(a.split("=")[1])
        if a.startswith("--timeout"):
            timeout = int(a.split("=")[1])
    qmax = 2**qbits
    print(f"[*] hunting weak curves on {host}:{port} "
          f"(q <= 2^{qbits}, attempt timeout {timeout}s)")
    tries = 0
    while True:
        tries += 1
        try:
            flag = one_attempt(host, port, qmax, timeout,
                               verbose=(tries % 50 == 1))
        except (socket.timeout, TimeoutError, OSError, Timeout):
            flag = None
        except Exception as e:  # parse hiccup -> just retry
            print(f"[-] attempt error ({type(e).__name__}), retrying")
            flag = None
        if flag:
            print(f"FLAG: {flag}  (after {tries} attempts)")
            return
        if tries % 50 == 0:
            print(f"[...] {tries} attempts so far...")


if __name__ == "__main__":
    main()
