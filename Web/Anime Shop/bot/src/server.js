const path = require('node:path');
const express = require('express');
const {buildReportUrl, visitUrl} = require('./bot');
const {getConfig} = require('./config');

const config = getConfig();
const app = express();

let activeVisits = 0;

function renderReport(res, statusCode = 200, message = '') {
  res.status(statusCode).render('report', {
    message,
    atCapacity: activeVisits >= config.maxConcurrentVisits,
  });
}

function queueVisit(url) {
  activeVisits += 1;

  void visitUrl(url, config)
    .then((result) => {
      console.log(`[web] page review finished: ${result.status} ${result.url}`);
    })
    .finally(() => {
      activeVisits -= 1;
    });
}

app.disable('x-powered-by');
app.set('views', path.join(__dirname, '..', 'views'));
app.set('view engine', 'ejs');
app.use(express.urlencoded({extended: false, limit: '8kb'}));
app.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.get('/', (_req, res) => {
  renderReport(res);
});

app.get('/healthz', (_req, res) => {
  res.type('text').send('ok');
});

app.post('/', (req, res) => {
  try {
    if (activeVisits >= config.maxConcurrentVisits) {
      renderReport(res, 429, 'The review queue is busy. Try again shortly.');
      return;
    }

    const url = buildReportUrl(req.body.path, config);
    queueVisit(url);
    renderReport(res, 202, 'Thanks. We will review this page shortly.');
  } catch (error) {
    renderReport(res, 400, error.message);
  }
});

app.use((_req, res) => {
  renderReport(res, 404, 'Not found');
});

app.listen(config.port, config.host, () => {
  console.log(`[web] page report server listening on http://${config.host}:${config.port}`);
  console.log(`[web] browser executable: ${config.firefoxPath}`);
});
