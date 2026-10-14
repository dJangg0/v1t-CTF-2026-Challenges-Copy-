"""Hextrap solver: targeted ECM stage-1 on j=0 sextic twists.

Math: p = Norm(z-1) with z a 2^15-smooth Eisenstein integer (N(z) = m smooth).
The six sextic twists of y^2 = x^3 + b' over Fp have orders N(1-zeta*pi);
for one twist this equals N(z) = m, fully 2^15-smooth. ECM stage-1 with
M = prod_{l^e <= 2^15} l^e kills a point mod p (but not mod random q),
so gcd(Z, n) = p. We dodge explicit twist enumeration by picking random
(x, y) and setting b' = y^2 - x^3 (random twist class, ~1/6 hit rate).
"""
import hashlib
import math
import random
import sys

sys_rng = random.SystemRandom()


def primes_upto(n):
    s = bytearray(b"\x01") * (n + 1)
    s[0:2] = b"\x00\x00"
    for i in range(2, int(n ** 0.5) + 1):
        if s[i]:
            s[i * i:n + 1:i] = b"\x00" * ((n - i * i) // i + 1)
    return [i for i in range(n + 1) if s[i]]


def stage1_scalar(bound):
    M = 1
    for l in primes_upto(bound):
        e = 1
        while l ** (e + 1) <= bound:
            e += 1
        M *= l ** e
    return M


def pt_dbl(n, X1, Y1, Z1):
    # dbl-2007-bl, a=0
    XX = (X1 * X1) % n
    YY = (Y1 * Y1) % n
    YYYY = (YY * YY) % n
    ZZ = (Z1 * Z1) % n
    S = (2 * ((X1 + YY) ** 2 - XX - YYYY)) % n
    M_ = (3 * XX) % n
    T = (M_ * M_ - 2 * S) % n
    X3 = T
    Y3 = (M_ * (S - T) - 8 * YYYY) % n
    Z3 = ((Y1 + Z1) ** 2 - YY - ZZ) % n
    return X3, Y3, Z3


def pt_add(n, X1, Y1, Z1, X2, Y2, Z2):
    # Jacobian short-Weierstrass addition, derived from the affine formulas
    # and verified numerically (x = X/Z^2, y = Y/Z^3).
    if Z1 % n == 0:
        return X2, Y2, Z2
    if Z2 % n == 0:
        return X1, Y1, Z1
    Z12 = (Z1 * Z2) % n
    Z1s = (Z1 * Z1) % n
    Z2s = (Z2 * Z2) % n
    U1 = (X1 * Z2s) % n
    U2 = (X2 * Z1s) % n
    S1 = (Y1 * Z2s * Z2) % n
    S2 = (Y2 * Z1s * Z1) % n
    H = (U2 - U1) % n
    R = (S2 - S1) % n
    if H == 0:
        return (1, 1, 0)  # P == +/- Q; caller routes P == Q to dbl
    X3 = (R * R - (U1 + U2) * H * H) % n
    Z3 = (H * Z12) % n
    Z3s = (Z3 * Z3) % n
    Z12s = (Z12 * Z12) % n
    W = (R * (U1 * Z3s - X3 * Z12s) - S1 * H * Z3s) % n
    return (X3 * Z12s) % n, (W * Z12) % n, (Z3 * Z12) % n


def _pt_eq(n, A, B):
    # Jacobian projective equality (None encodes infinity via Z == 0)
    if A[2] % n == 0 or B[2] % n == 0:
        return (A[2] % n == 0) and (B[2] % n == 0)
    return ((A[0] * B[2] * B[2] - B[0] * A[2] * A[2]) % n == 0 and
            (A[1] * B[2] ** 3 - B[1] * A[2] ** 3) % n == 0)


def _pt_neg(n, A):
    return (A[0] % n, (-A[1]) % n, A[2] % n)


def scalar_mul(n, M, P):
    X, Y, Z = P
    R = (1, 1, 0)
    for bit in bin(M)[2:]:
        R = pt_dbl(n, *R)
        if bit == "1":
            if R[2] % n == 0:
                R = P
            elif _pt_eq(n, R, P):
                R = pt_dbl(n, *R)
            elif _pt_eq(n, R, _pt_neg(n, P)):
                R = (1, 1, 0)
            else:
                R = pt_add(n, *R, *P)
    return R


def mgf1(seed, outlen, h=hashlib.sha1):
    out = b""
    for c in range((outlen + h().digest_size - 1) // h().digest_size):
        out += h(seed + c.to_bytes(4, "big")).digest()
    return out[:outlen]


def oaep_decode(em, h=hashlib.sha1):
    hlen = h().digest_size
    assert em[0] == 0
    masked_seed, masked_db = em[1:1 + hlen], em[1 + hlen:]
    seed = bytes(a ^ b for a, b in zip(masked_seed, mgf1(masked_db, hlen)))
    db = bytes(a ^ b for a, b in zip(masked_db, mgf1(seed, len(masked_db))))
    assert db[:hlen] == h(b"").digest(), "lHash mismatch"
    i = hlen
    while db[i] == 0:
        i += 1
    assert db[i] == 1
    return db[i + 1:]


def main():
    out = open("output.txt").read()
    n = int(out.split("n = ")[1].split()[0])
    e = int(out.split("e = ")[1].split()[0])
    c = int(out.split("c = ")[1].split()[0], 16)
    print(f"n bits: {n.bit_length()}", flush=True)
    M = stage1_scalar(2**15)
    print(f"stage-1 scalar bits: {M.bit_length()}", flush=True)

    for trial in range(1, 1000):
        x = sys_rng.randrange(2, n - 1)
        y = sys_rng.randrange(2, n - 1)
        b = (y * y - x * x * x) % n
        g0 = math.gcd(b, n)
        if 1 < g0 < n:
            p = g0
            print(f"free factor from b (trial {trial})")
            break
        X3, Y3, Z3 = scalar_mul(n, M, (x, y, 1))
        g = math.gcd(Z3, n)
        if trial % 5 == 0:
            print(f"trial {trial}... (gcd bits={g.bit_length() if g > 1 else 0})", flush=True)
        if 1 < g < n:
            p = g
            print(f"factor found on trial {trial}")
            break
    else:
        print("no factor found")
        return

    q = n // p
    assert p * q == n
    phi = (p - 1) * (q - 1)
    assert math.gcd(e, phi) == 1
    d = pow(e, -1, phi)
    m = pow(c, d, n)
    em = m.to_bytes((n.bit_length() + 7) // 8, "big")
    flag = oaep_decode(em)
    print("FLAG:", flag.decode())


if __name__ == "__main__":
    main()
