const crypto = require('crypto')
const express = require('express')
const puppeteer = require('puppeteer-core')

const app = express()

const botPort = Number(process.env.BOT_PORT || 3000)
const appBaseUrl = trimTrailingSlash(process.env.APP_BASE_URL || process.env.WIKI_BASE_URL || 'http://app:3000')
const appBrowserBaseUrl = trimTrailingSlash(process.env.APP_BROWSER_BASE_URL || appBaseUrl)
const appPublicBaseUrl = trimTrailingSlash(process.env.APP_PUBLIC_BASE_URL || process.env.WIKI_PUBLIC_BASE_URL || 'http://localhost:9000')
const assistantEmail = process.env.WIKI_ASSISTANT_EMAIL || 'assistant@example.com'
const assistantPassword = process.env.WIKI_ASSISTANT_PASSWORD || 'Assistant123!'
const browserTimeoutMs = Number(process.env.BOT_TIMEOUT_MS || 15000)
const visitDelayMs = Number(process.env.BOT_VISIT_DELAY_MS || 5000)
const htmlLimit = Number(process.env.BOT_HTML_LIMIT || 20000)
const localStorageKey = process.env.BOT_LOCALSTORAGE_KEY || 'FLAG'
const localStorageValue = process.env.BOT_LOCALSTORAGE_VALUE || process.env.FLAG || 'v1t{fake_flag}'
const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium'
const maxTabs = Math.max(1, Number(process.env.BOT_MAX_TABS || 20))

let activeVisits = 0
let totalVisits = 0
let browserPromise = null
let jwtCache = null
let jwtPromise = null
let pageCreateQueue = Promise.resolve()

app.disable('x-powered-by')
app.use(express.urlencoded({ extended: false, limit: `${htmlLimit + 1024}b` }))
app.use(express.json({ limit: `${htmlLimit + 1024}b` }))

app.get('/healthz', (req, res) => {
  res.json({
    ok: true,
    activeVisits,
    maxTabs
  })
})

app.get('/', (req, res) => {
  res.type('html').send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>DuckWiki Bot</title>
  </head>
  <body>
    <form action="/" method="post">
      <textarea name="html" rows="12" cols="80" placeholder="<h1>Hello</h1>" required></textarea>
      <br>
      <button type="submit">Create page and visit</button>
    </form>
  </body>
</html>`)
})

app.post('/', handleVisit)

app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'not found' })
})

app.listen(botPort, () => {
  console.log(`[bot] listening on :${botPort}`)
  console.log(`[bot] app base: ${appBaseUrl}`)
  console.log(`[bot] browser base: ${appBrowserBaseUrl}`)
  console.log(`[bot] max tabs: ${maxTabs}`)
})

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

async function handleVisit(req, res) {
  const html = req.body.html
  if (!html || typeof html !== 'string') {
    return res.status(400).json({ ok: false, error: 'missing html' })
  }
  if (Buffer.byteLength(html, 'utf8') > htmlLimit) {
    return res.status(413).json({ ok: false, error: 'html too large' })
  }

  if (activeVisits >= maxTabs) {
    return res.status(429).json({ ok: false, error: 'too many active bot tabs' })
  }

  activeVisits += 1
  const visitId = ++totalVisits
  try {
    const jwt = await getAssistantJwt()
    const page = await enqueuePageCreate(jwt, html)
    await visitAsAssistant(jwt, page.url, visitId)
    res.json({
      ok: true,
      path: page.path,
      url: page.publicUrl
    })
  } catch (err) {
    console.error(`[bot] visit #${visitId} failed: ${err.stack || err.message}`)
    res.status(500).json({ ok: false, error: 'visit failed' })
  } finally {
    activeVisits -= 1
  }
}

async function getAssistantJwt() {
  if (jwtCache && jwtCache.expiresAt > Date.now()) {
    return jwtCache.token
  }

  if (!jwtPromise) {
    jwtPromise = login().then(token => {
      jwtCache = {
        token,
        expiresAt: Date.now() + 25 * 60 * 1000
      }
      return token
    }).finally(() => {
      jwtPromise = null
    })
  }

  return jwtPromise
}

function enqueuePageCreate(jwt, html) {
  const run = pageCreateQueue
    .catch(() => {})
    .then(() => createRandomPage(jwt, html))

  pageCreateQueue = run.catch(() => {})
  return run
}

async function createRandomPage(jwt, html) {
  const slug = crypto.randomBytes(8).toString('hex')
  const path = `bot/${slug}`
  const title = `Bot ${slug}`
  const result = await graphql(
    `mutation ($content: String!, $path: String!, $title: String!) {
      pages {
        create(
          content: $content
          description: ""
          editor: "code"
          isPublished: true
          isPrivate: false
          locale: "en"
          path: $path
          tags: []
          title: $title
        ) {
          responseResult {
            succeeded
            message
          }
          page {
            id
            path
            title
          }
        }
      }
    }`,
    { content: html, path, title },
    jwt
  )

  const response = result.data?.pages?.create?.responseResult
  if (!response?.succeeded) {
    throw new Error(response?.message || 'page creation failed')
  }

  return {
    path,
    url: `${appBrowserBaseUrl}/${path}`,
    publicUrl: `${appPublicBaseUrl}/${path}`
  }
}

async function visitAsAssistant(jwt, targetUrl, visitId) {
  const browser = await getBrowser()
  const context = await createContext(browser)

  try {
    const page = await context.newPage()
    page.setDefaultTimeout(browserTimeoutMs)
    page.setDefaultNavigationTimeout(browserTimeoutMs)

    await page.goto(`${appBrowserBaseUrl}/healthz`, { waitUntil: 'domcontentloaded' })

    await page.setCookie({
      name: 'jwt',
      value: jwt,
      url: appBrowserBaseUrl,
      httpOnly: true,
      sameSite: 'Lax'
    })
    if (localStorageKey && localStorageValue) {
      await page.evaluate(({ key, value }) => {
        window.localStorage.setItem(key, value)
      }, {
        key: localStorageKey,
        value: localStorageValue
      })
    }

    console.log(`[bot] visit #${visitId}: ${targetUrl}`)
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await delay(visitDelayMs)
  } finally {
    await context.close().catch(() => {})
  }
}

async function login() {
  const result = await graphql(
    `mutation ($username: String!, $password: String!) {
      authentication {
        login(username: $username, password: $password, strategy: "local") {
          jwt
          responseResult {
            succeeded
            message
          }
        }
      }
    }`,
    {
      username: assistantEmail,
      password: assistantPassword
    }
  )

  const loginResult = result.data?.authentication?.login
  if (!loginResult?.jwt) {
    throw new Error(loginResult?.responseResult?.message || 'login failed')
  }

  return loginResult.jwt
}

async function graphql(query, variables, jwt) {
  const headers = { 'Content-Type': 'application/json' }
  if (jwt) {
    headers.Authorization = `Bearer ${jwt}`
  }

  const res = await fetch(`${appBaseUrl}/graphql`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables })
  })

  if (!res.ok) {
    throw new Error(`GraphQL HTTP ${res.status}`)
  }

  const body = await res.json()
  if (body.errors?.length) {
    throw new Error(body.errors.map(err => err.message).join('; '))
  }

  return body
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      executablePath,
      headless: 'new',
      args: [
        '--disable-background-networking',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-sync',
        '--no-first-run',
        '--no-sandbox',
        '--no-zygote'
      ]
    }).then(browser => {
      browser.on('disconnected', () => {
        browserPromise = null
      })
      return browser
    }).catch(err => {
      browserPromise = null
      throw err
    })
  }

  const browser = await browserPromise
  if (!browser.isConnected()) {
    browserPromise = null
    return getBrowser()
  }
  return browser
}

async function createContext(browser) {
  if (typeof browser.createBrowserContext === 'function') {
    return browser.createBrowserContext()
  }
  return browser.createIncognitoBrowserContext()
}

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '')
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function shutdown() {
  const browser = browserPromise ? await browserPromise.catch(() => null) : null
  if (browser) {
    await browser.close().catch(() => {})
  }
  process.exit(0)
}
