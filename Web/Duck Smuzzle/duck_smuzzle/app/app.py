# 00:06 21/06/2026
#
# This challenge is currently unsolvable due to an incorrect WAF configuration.
#
# The intended original solution was:
# 1. Access the /flag route without authentication.
# 2. Leak the jwt_secret from the exposed flag-related endpoint.
# 3. Forge a valid JWT using the leaked secret.
# 4. Set the role claim to "duck".
# 5. Use the forged JWT to access the /duck route and retrieve the flag.
#
# However, the current WAF / reverse proxy configuration blocks the intended flow.
#
# TODO:
# Fix either nginx.conf or Caddyfile so that:
# - The password requirement only applies to the /duck route.
# - The /flag route does not require a password, allowing jwt_secret to be leaked as intended.
# - The unnecessary block on the /duck route is removed or adjusted.


import hashlib
import os
import jwt

from fastapi import FastAPI, Response, Cookie
from guard.middleware import SecurityMiddleware
from guard.models import SecurityConfig
from dotenv import load_dotenv

app = FastAPI()

load_dotenv()
load_dotenv("/static/private/.jwtenv")

FLAG = os.getenv("FLAG", "v1t{fake_flag}")
JWT_SECRET = os.getenv("JWT_SECRET", "dev_secret")
JWT_ALG = "HS256"

config = SecurityConfig(
    enable_redis=False,
    whitelist=["67.67.67.67"],
    exclude_paths=["/goose", "/flag"],
)

app.add_middleware(SecurityMiddleware, config=config)


def create_jwt(role: str) -> str:
    return jwt.encode(
        {"role": role},
        JWT_SECRET,
        algorithm=JWT_ALG,
    )


def get_role_from_jwt(token: str | None) -> str | None:
    if not token:
        return None

    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALG],
        )
        return payload.get("role")
    except jwt.PyJWTError:
        return None


@app.get("/duck")
async def REDACTED(
    password: str,
    sid: str | None = Cookie(default=None),
):
    role = get_role_from_jwt(sid)

    if password == "REDACTED" and role == "duck":
        return FLAG

    return "quack"


@app.get("/goose")
async def public(response: Response):
    token = create_jwt("goose")

    response.set_cookie(
        key="sid",
        value=token,
        httponly=True,
        samesite="lax",
    )

    return "honk"


@app.get("/flag")
async def flag(
    response: Response,
    x: str,
    y: str,
    password: str | None = None,
):
    if password == "REDACTED":
        response.headers[x] = y
    return hashlib.sha256(FLAG.encode()).hexdigest()