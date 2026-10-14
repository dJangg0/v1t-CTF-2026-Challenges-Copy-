ARG WIKIJS_IMAGE=ghcr.io/requarks/wiki:2
FROM ${WIKIJS_IMAGE}

COPY init.js /wiki/init.js
COPY docker-entrypoint-init.sh /usr/local/bin/docker-entrypoint-init.sh

USER root
RUN chmod +x /usr/local/bin/docker-entrypoint-init.sh \
  && chown node:node /wiki/init.js
USER node

ENTRYPOINT ["docker-entrypoint-init.sh"]
CMD ["node", "--no-deprecation", "server"]
