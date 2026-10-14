FROM ubuntu:24.04 AS build
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev
COPY readflag.c /readflag.c
RUN gcc -O2 -static -o /readflag /readflag.c

FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends socat && \
    rm -rf /var/lib/apt/lists/* && \
    userdel -r ubuntu 2>/dev/null; useradd -m -u 1000 pwn

WORKDIR /chal
COPY d8 snapshot_blob.bin icudtl.dat run.sh /chal/
COPY --from=build /readflag /readflag
COPY flag /flag

RUN chmod 0755 /chal/d8 /chal/run.sh /chal/snapshot_blob.bin /chal/icudtl.dat && \
    chown root:root /readflag && chmod 4755 /readflag && \
    chown root:root /flag && chmod 0400 /flag

EXPOSE 1337
USER pwn
CMD ["socat", "-T120", "TCP-LISTEN:1337,reuseaddr,fork", "EXEC:/chal/run.sh,stderr"]
