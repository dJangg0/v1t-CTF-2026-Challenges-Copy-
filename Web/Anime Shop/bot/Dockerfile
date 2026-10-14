FROM node:22-bookworm-slim

ARG FIREFOX_VERSION=137.0b10

ENV FIREFOX_PATH=/opt/firefox/firefox \
    NODE_ENV=production

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        fonts-liberation \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libcairo2 \
        libcups2 \
        libdbus-1-3 \
        libdrm2 \
        libgbm1 \
        libgtk-3-0 \
        libnspr4 \
        libnss3 \
        libpango-1.0-0 \
        libx11-xcb1 \
        libxcomposite1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxrandr2 \
        libxrender1 \
        libxtst6 \
        xz-utils \
    && curl -fsSL --retry 3 --connect-timeout 20 \
        "https://ftp.mozilla.org/pub/firefox/releases/${FIREFOX_VERSION}/linux-x86_64/en-US/firefox-${FIREFOX_VERSION}.tar.xz" \
        -o /tmp/firefox.tar.xz \
    && tar -xJf /tmp/firefox.tar.xz -C /opt \
    && rm -rf /var/lib/apt/lists/* /tmp/firefox.tar.xz \
    && "${FIREFOX_PATH}" --version

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src
COPY views ./views

EXPOSE 8000
CMD ["node", "src/server.js"]
