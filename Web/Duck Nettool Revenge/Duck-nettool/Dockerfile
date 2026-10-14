FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends iputils-ping \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /usr/sbin/nologin ctf

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY app.py /app/app.py
COPY templates /app/templates
COPY flag.txt /app/flag.txt
COPY flag.py /app/flag.py

RUN FLAG_SHA256=$(sha256sum /app/flag.txt | awk '{print $1}') \
    && printf '#!/bin/sh\necho "%s"\n' "$FLAG_SHA256" > /app/init \
    && chmod 0555 /app/init

RUN chown ctf:ctf /app/app.py /app/requirements.txt \
    && chown -R ctf:ctf /app/templates \
    && chown root:root /app/flag.txt /app/flag.py \
    && chmod 0000 /app/flag.txt \
    && chmod 0444 /app/flag.py

RUN set -eux; \
    mkdir -p /opt/keep-bin; \
    cp -L /bin/sh /opt/keep-bin/sh; \
    python3 -c "import os; allow = {'/bin': {'sh', 'ping'}, '/usr/bin': {'sh', 'ping'}, '/usr/local/bin': {'python', 'python3', 'python3.11', 'gunicorn'}}; [os.unlink(os.path.join(base, name)) for base, keep in allow.items() for name in os.listdir(base) if name not in keep and (os.path.isfile(os.path.join(base, name)) or os.path.islink(os.path.join(base, name)))]"; \
    python3 -c "import shutil; shutil.copy2('/opt/keep-bin/sh', '/bin/sh'); shutil.rmtree('/opt/keep-bin')"

ENV PATH=/usr/local/bin:/bin:/usr/bin

USER ctf

EXPOSE 5000

CMD ["gunicorn", "-b", "0.0.0.0:5000", "app:app"]
