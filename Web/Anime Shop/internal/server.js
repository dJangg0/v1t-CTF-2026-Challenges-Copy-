const http = require('node:http');

const host = '0.0.0.0';
const port = Number.parseInt(process.env.PORT || '5000', 10);

function writeRaw(res, statusCode, body) {
  const data = Buffer.from(body);
  res.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Length': data.length,
  });
  res.end(data);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/') {
    writeRaw(res, 200, 'OK');
    return;
  }

  if (url.pathname === '/admin') {
    writeRaw(res, 200, process.env.FLAG || 'v1t{dummy_dummy}');
    return;
  }

  writeRaw(res, 404, 'Not Found');
});

server.listen(port, host, () => {
  console.log(`[web] service listening on http://${host}:${port}`);
});
