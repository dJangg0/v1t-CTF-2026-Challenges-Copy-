# Coolify deploy map — one Coolify resource per challenge.
# Source: Public repository https://github.com/dJangg0/v1t-CTF-2026-Challenges-Copy- , branch main

## TCP (nc) — Build pack: Dockerfile, no HTTPS, connect with `nc`
| Challenge | Base directory | Port | Flag location |
|---|---|---|---|
| StaleMate | /Pwn/StaleMate | 31337 | Pwn/StaleMate/flag.txt -> /flag |
| StaleMate Revenge | /Pwn/StaleMate Revenge | 31337 | Pwn/StaleMate Revenge/flag.txt -> /flag |
| Acroform | /Pwn/Acroform/Duck8 | 1337 | Pwn/Acroform/Duck8/flag -> /flag |
| CuRvE | /Crypto/CuRvE | 13237 | Crypto/CuRvE/server/flag.txt |

## Web (HTTP) — Build pack: Docker Compose, HTTPS domain OK
| Challenge | Base directory (compose file) | Ports | Flag / env |
|---|---|---|---|
| AnimeShop | /Web/Anime Shop | 3000 (app), 8000 (bot) | FLAG env (internal service), SHOP_CUSTOMER_* |
| Duck Smuzzle | /Web/Duck Smuzzle/duck_smuzzle | 80, 81 | duck_smuzzle/app/.env, static/private/.jwtenv |
| Duck Nettool Revenge | /Web/Duck Nettool Revenge/Duck-nettool | 5000 | Duck-nettool/flag.txt |
| DuckWiki | /Web/Duck Wiki | 9000 (app), 9001 (proxy) | BOT_LOCALSTORAGE_VALUE env |

## Static site — Build pack: Static
| Site | Base directory |
|---|---|
| CTF archive | /docs |

## Not deployable (file-only, solve locally)
Hextrap, Slop Anti or Anti Slop, China Crack 101/202, Real World,
all Forensics/Rev/Misc/Osint/Hardware (except oas, which is local-only),
B1tsy Ducky, HVL, BasicQnA, Kaspersky (no source in repo).
