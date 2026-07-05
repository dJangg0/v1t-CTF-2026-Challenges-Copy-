def fold_lens(words: list[int]) -> bytes:
      if len(words) != 12:
          raise ValueError("lens must contain exactly 12 words")
      return b"".join(w.to_bytes(3, "big") for w in words)


def fixed_mod(x: int, p: int) -> bytes:
    width = (p.bit_length() + 7) // 8
    return x.to_bytes(width, "big")


def derive_material(lens: list[int], remote: int, shared_x: int, p: int) -> bytes:
    return hashlib.sha256(
        b"visual-lattice/final/"
        + fold_lens(lens)
        + fixed_mod(remote, p)
        + fixed_mod(shared_x, p)
    ).digest()