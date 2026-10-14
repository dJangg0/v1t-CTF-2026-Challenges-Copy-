FROM sagemath/sagemath:latest

USER root
RUN apt-get update && apt-get install -y --no-install-recommends socat \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /home/sage/chal
COPY server/chall.py ./chall.py
COPY server/flag.txt ./flag.txt
RUN chmod 644 ./chall.py ./flag.txt

EXPOSE 13237

# NOTE: no socat -T idle timeout on purpose: the winning solve holds the
# connection open during the Pollard-rho phase (tens of minutes).
CMD ["socat", "TCP-LISTEN:13237,reuseaddr,fork", "EXEC:sage chall.py,stderr"]
