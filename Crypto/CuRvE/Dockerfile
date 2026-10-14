FROM sagemath/sagemath:latest

USER root
RUN apt-get update && apt-get install -y --no-install-recommends socat \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /home/sage/chal
COPY server/chall.py ./chall.py
COPY server/flag.txt ./flag.txt
RUN chmod 644 ./chall.py ./flag.txt

EXPOSE 13237

CMD ["socat", "-T", "60", "TCP-LISTEN:13237,reuseaddr,fork", "EXEC:sage chall.py,stderr"]
