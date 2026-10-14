FROM python:3.10-alpine
WORKDIR /app
COPY app/ .
RUN pip install --no-cache-dir -r requirements.txt
RUN python -c "import pathlib,secrets,string; p=pathlib.Path('app.py'); token=secrets.choice(string.ascii_letters)+''.join(secrets.choice(string.ascii_letters+string.digits) for _ in range(31)); p.write_text(p.read_text().replace('REDACTED', token))"
EXPOSE 9999
CMD ["hypercorn", "--config", "hypercorn.toml", "app:app"]
