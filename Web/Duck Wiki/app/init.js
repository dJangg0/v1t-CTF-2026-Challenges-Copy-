const baseUrl = process.env.WIKI_INIT_BASE_URL || 'http://127.0.0.1:3000'
const adminEmail = process.env.WIKI_ADMIN_EMAIL || 'admin@example.com'
const adminPassword = process.env.WIKI_ADMIN_PASSWORD || 'ChangeMe123!'
const assistantEmail = process.env.WIKI_ASSISTANT_EMAIL || 'assistant@example.com'
const assistantPassword = process.env.WIKI_ASSISTANT_PASSWORD || 'Assistant123!'
const assistantGroupName = 'Assistant'
const assistantPagePrefix = 'bot/'
const siteUrl = process.env.WIKI_SITE_URL || 'http://localhost:9000'
const pageTitle = process.env.WIKI_INIT_PAGE_TITLE || 'Duck Wiki'
const pagePath = normalizePath(process.env.WIKI_INIT_PAGE_PATH || 'home')
const pageContent = process.env.WIKI_INIT_PAGE_CONTENT || '<h1>Hello world</h1>'
const initTimeoutMs = Number(process.env.WIKI_INIT_TIMEOUT_MS || 120000)

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function normalizePath(value) {
  return String(value || 'home').replace(/^\/+/, '').replace(/\/+$/, '') || 'home'
}

function sameValues(actual = [], expected = []) {
  return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort())
}

function assistantGroupIsCurrent(group) {
  const permissions = ['read:pages', 'write:pages']
  const rules = group?.pageRules || []
  const rule = rules[0]
  return group?.name === assistantGroupName &&
    group?.redirectOnLogin === '/' &&
    sameValues(group?.permissions, permissions) &&
    rules.length === 1 &&
    rule.id === 'assistant-bot-pages' &&
    rule.deny === false &&
    rule.match === 'START' &&
    rule.path === assistantPagePrefix &&
    sameValues(rule.roles, permissions) &&
    sameValues(rule.locales, ['en'])
}

async function request(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    redirect: 'manual',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  })
  const text = await res.text()
  const contentType = res.headers.get('content-type') || ''
  const body = contentType.includes('application/json') && text ? JSON.parse(text) : text
  return { res, body, text }
}

async function waitForHttp() {
  const startedAt = Date.now()
  while (Date.now() - startedAt < initTimeoutMs) {
    try {
      const { res, text } = await request('/')
      if (res.status < 500 && text) {
        return text
      }
    } catch (err) {
      // Wiki.js is still booting.
    }
    await sleep(1000)
  }
  throw new Error(`Timed out waiting for Wiki.js at ${baseUrl}`)
}

async function waitForGraphql() {
  const startedAt = Date.now()
  while (Date.now() - startedAt < initTimeoutMs) {
    try {
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
        { username: adminEmail, password: adminPassword }
      )
      const login = result.data?.authentication?.login
      if (login?.jwt) {
        return login.jwt
      }
    } catch (err) {
      // Full Wiki.js mode is still starting.
    }
    await sleep(1000)
  }
  throw new Error('Timed out waiting for Wiki.js GraphQL login')
}

async function graphql(query, variables, token) {
  const { res, body } = await request('/graphql', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify({ query, variables })
  })
  if (!res.ok) {
    throw new Error(`GraphQL HTTP ${res.status}: ${JSON.stringify(body).slice(0, 500)}`)
  }
  if (body.errors?.length) {
    throw new Error(`GraphQL error: ${body.errors.map(err => err.message).join('; ')}`)
  }
  return body
}

async function setupIfNeeded(initialHtml) {
  if (!initialHtml.includes('Wiki.js Setup') && !initialHtml.includes('<setup ')) {
    console.log('[init] Wiki.js is already initialized; skipping setup.')
    return
  }

  console.log(`[init] Finalizing Wiki.js setup for ${adminEmail}...`)
  const { res, body } = await request('/finalize', {
    method: 'POST',
    body: JSON.stringify({
      siteUrl,
      adminEmail,
      adminPassword,
      telemetry: false
    })
  })

  if (!res.ok || body?.ok !== true) {
    throw new Error(`Wiki.js setup failed: ${JSON.stringify(body)}`)
  }
}

async function getPage(token) {
  const result = await graphql(
    `query ($path: String!, $locale: String!) {
      pages {
        singleByPath(path: $path, locale: $locale) {
          id
          title
          content
          description
          isPublished
          isPrivate
          scriptCss
          scriptJs
          tags {
            tag
          }
        }
      }
    }`,
    { path: pagePath, locale: 'en' },
    token
  ).catch(err => {
    if (err.message.includes('Page Not Found') || err.message.includes('does not exist')) {
      return null
    }
    throw err
  })
  return result?.data?.pages?.singleByPath || null
}

async function createPage(token) {
  const existingPage = await getPage(token)
  if (existingPage?.title === pageTitle) {
    console.log(`[init] Page "${pageTitle}" already exists at /${pagePath}; skipping.`)
    return
  }

  if (existingPage) {
    console.log(`[init] Updating page title at /${pagePath} to "${pageTitle}"...`)
    const updateResult = await graphql(
      `mutation (
        $id: Int!
        $content: String!
        $description: String!
        $isPublished: Boolean!
        $isPrivate: Boolean!
        $scriptCss: String
        $scriptJs: String
        $tags: [String]!
        $title: String!
      ) {
        pages {
          update(
            id: $id
            content: $content
            description: $description
            isPublished: $isPublished
            isPrivate: $isPrivate
            scriptCss: $scriptCss
            scriptJs: $scriptJs
            tags: $tags
            title: $title
          ) {
            responseResult {
              succeeded
              message
            }
          }
        }
      }`,
      {
        id: existingPage.id,
        content: existingPage.content,
        description: existingPage.description,
        isPublished: existingPage.isPublished,
        isPrivate: existingPage.isPrivate,
        scriptCss: existingPage.scriptCss || '',
        scriptJs: existingPage.scriptJs || '',
        tags: existingPage.tags?.map(tag => tag.tag) || [],
        title: pageTitle
      },
      token
    )
    const update = updateResult.data?.pages?.update?.responseResult
    if (!update?.succeeded) {
      throw new Error(`Page title update failed: ${update?.message || JSON.stringify(updateResult)}`)
    }
    return
  }

  console.log(`[init] Creating page "${pageTitle}" at /${pagePath}...`)
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
    { content: pageContent, path: pagePath, title: pageTitle },
    token
  )

  const response = result.data?.pages?.create?.responseResult
  if (!response?.succeeded) {
    throw new Error(`Page creation failed: ${response?.message || JSON.stringify(result)}`)
  }
}

async function ensureAssistantGroup(token) {
  const groupsResult = await graphql(
    `query {
      groups {
        list {
          id
          name
        }
      }
    }`,
    {},
    token
  )

  let group = groupsResult.data?.groups?.list?.find(item => item.name === assistantGroupName)
  let needsUpdate = true
  if (!group) {
    console.log(`[init] Creating group "${assistantGroupName}"...`)
    const createResult = await graphql(
      `mutation ($name: String!) {
        groups {
          create(name: $name) {
            responseResult {
              succeeded
              message
            }
            group {
              id
              name
            }
          }
        }
      }`,
      { name: assistantGroupName },
      token
    )
    const create = createResult.data?.groups?.create
    if (!create?.responseResult?.succeeded || !create.group?.id) {
      throw new Error(`Assistant group creation failed: ${create?.responseResult?.message || JSON.stringify(createResult)}`)
    }
    group = create.group
  } else {
    const groupResult = await graphql(
      `query ($id: Int!) {
        groups {
          single(id: $id) {
            id
            name
            redirectOnLogin
            permissions
            pageRules {
              id
              deny
              match
              roles
              path
              locales
            }
          }
        }
      }`,
      { id: group.id },
      token
    )
    group = groupResult.data?.groups?.single
    needsUpdate = !assistantGroupIsCurrent(group)
  }

  if (!needsUpdate) {
    return group.id
  }

  const updateResult = await graphql(
    `mutation ($id: Int!, $name: String!, $permissions: [String]!, $pageRules: [PageRuleInput]!) {
      groups {
        update(
          id: $id
          name: $name
          redirectOnLogin: "/"
          permissions: $permissions
          pageRules: $pageRules
        ) {
          responseResult {
            succeeded
            message
          }
        }
      }
    }`,
    {
      id: group.id,
      name: assistantGroupName,
      permissions: ['read:pages', 'write:pages'],
      pageRules: [{
        id: 'assistant-bot-pages',
        deny: false,
        match: 'START',
        roles: ['read:pages', 'write:pages'],
        path: assistantPagePrefix,
        locales: ['en']
      }]
    },
    token
  )
  const update = updateResult.data?.groups?.update?.responseResult
  if (!update?.succeeded) {
    throw new Error(`Assistant group update failed: ${update?.message || JSON.stringify(updateResult)}`)
  }

  return group.id
}

async function ensureAssistantUser(token, groupId) {
  const usersResult = await graphql(
    `query {
      users {
        list {
          id
          email
          providerKey
        }
      }
    }`,
    {},
    token
  )
  const user = usersResult.data?.users?.list?.find(item => (
    item.providerKey === 'local' && item.email.toLowerCase() === assistantEmail.toLowerCase()
  ))

  if (!user) {
    console.log(`[init] Creating assistant account ${assistantEmail}...`)
    const createResult = await graphql(
      `mutation ($email: String!, $name: String!, $password: String!, $groups: [Int]!) {
        users {
          create(
            email: $email
            name: $name
            passwordRaw: $password
            providerKey: "local"
            groups: $groups
            mustChangePassword: false
            sendWelcomeEmail: false
          ) {
            responseResult {
              succeeded
              message
            }
          }
        }
      }`,
      {
        email: assistantEmail,
        name: 'Assistant',
        password: assistantPassword,
        groups: [groupId]
      },
      token
    )
    const create = createResult.data?.users?.create?.responseResult
    if (!create?.succeeded) {
      throw new Error(`Assistant user creation failed: ${create?.message || JSON.stringify(createResult)}`)
    }
    return
  }

  const userResult = await graphql(
    `query ($id: Int!) {
      users {
        single(id: $id) {
          id
          email
          name
          providerKey
          groups {
            id
          }
        }
      }
    }`,
    { id: user.id },
    token
  )
  const currentUser = userResult.data?.users?.single
  const loginResult = await graphql(
    `mutation ($username: String!, $password: String!) {
      authentication {
        login(username: $username, password: $password, strategy: "local") {
          jwt
        }
      }
    }`,
    { username: assistantEmail, password: assistantPassword }
  )
  const credentialsAreCurrent = Boolean(loginResult.data?.authentication?.login?.jwt)
  const groupsAreCurrent = sameValues(currentUser?.groups?.map(group => group.id), [groupId])
  if (
    currentUser?.email.toLowerCase() === assistantEmail.toLowerCase() &&
    currentUser?.name === 'Assistant' &&
    groupsAreCurrent &&
    credentialsAreCurrent
  ) {
    return
  }

  const updateResult = await graphql(
    `mutation ($id: Int!, $email: String!, $name: String!, $password: String!, $groups: [Int]!) {
      users {
        update(
          id: $id
          email: $email
          name: $name
          newPassword: $password
          groups: $groups
        ) {
          responseResult {
            succeeded
            message
          }
        }
      }
    }`,
    {
      id: user.id,
      email: assistantEmail,
      name: 'Assistant',
      password: assistantPassword,
      groups: [groupId]
    },
    token
  )
  const update = updateResult.data?.users?.update?.responseResult
  if (!update?.succeeded) {
    throw new Error(`Assistant user update failed: ${update?.message || JSON.stringify(updateResult)}`)
  }
}

async function ensureAssistantAccount(token) {
  const groupId = await ensureAssistantGroup(token)
  await ensureAssistantUser(token, groupId)
  console.log(`[init] Assistant account ready with access limited to ${assistantPagePrefix}*.`)
}

async function main() {
  const initialHtml = await waitForHttp()
  await setupIfNeeded(initialHtml)
  const token = await waitForGraphql()
  await ensureAssistantAccount(token)
  await createPage(token)
  console.log('[init] Wiki.js initialization complete.')
}

main().catch(err => {
  console.error(`[init] ${err.stack || err.message}`)
  process.exit(1)
})
