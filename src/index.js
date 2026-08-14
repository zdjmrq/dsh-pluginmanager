// dsh-user-plugins-manager — Host half(bundle 层挂载)
//
// 在“设置 → 插件 → 用户插件”页面的背后提供 JSON 管理 API:
//   GET /dsh-user-plugins/state    ?sessionId=<当前会话>
//   GET /dsh-user-plugins/mount    ?file=<插件文件名>&sessionId=...
//   GET /dsh-user-plugins/unmount  ?id=<条目id>&source=<补丁文件>&sessionId=...
//   GET /dsh-user-plugins/enable   ?id=...&source=...&sessionId=...
//   GET /dsh-user-plugins/disable  ?id=...&source=...&sessionId=...
//
// 管理对象:~/.dsh/plugins 下的插件文件,以及把它们挂载进组合树的
// 用户补丁层(profile 的 cordis.patch.yml 与家目录 cordis.patch.yml)。
// 写入一律经 fs 服务并按“当前会话”解析出的沙箱策略围栏,绝不绕过策略;
// 补丁文件被 CLI 的 HMR 监听,保存后热重载、无需重启。

export const name = 'user-plugins-manager'

export const inject = ['webServer']

export function apply(ctx) {
  const fs = ctx.get('fs')
  const settings = ctx.get('settings')
  const sandboxPolicy = ctx.get('sandboxPolicy')
  const sessions = ctx.get('sessions')

  function errorOf(value) {
    return value instanceof Error ? (value.message || String(value)) : String(value)
  }

  function stripQuotes(value) {
    const v = String(value).trim()
    if (v.length >= 2 && ((v[0] === "'" && v[v.length - 1] === "'") || (v[0] === '"' && v[v.length - 1] === '"'))) {
      return v.slice(1, -1)
    }
    return v
  }

  function normalizeName(value) {
    try { return String(value).toLowerCase() } catch { return String(value) }
  }

  function sameName(a, b) {
    if (a === undefined || b === undefined) return false
    if (normalizeName(a) === normalizeName(b)) return true
    try { return normalizeName(decodeURIComponent(a)) === normalizeName(b) } catch { return false }
  }

  function dirname(path) {
    const index = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
    return index < 0 ? path : path.slice(0, index)
  }

  // 定位 DSH_HOME:优先从 settings 文档路径反推,其次读取启动环境快照。
  async function locateHome() {
    if (settings !== undefined) {
      try {
        const documentPath = await settings.prepareDocument()
        if (documentPath !== undefined && documentPath !== '') return dirname(documentPath)
      } catch { /* fall through */ }
    }
    try {
      const launchEnv = ctx.get('launchEnvironment')
      if (launchEnv !== undefined) {
        for (const name of ['DSH_HOME', 'USERPROFILE', 'HOME']) {
          const entry = launchEnv.get(name)
          if (entry !== undefined && entry.value !== undefined && entry.value !== '') {
            return name === 'DSH_HOME' ? entry.value : entry.value + '/.dsh'
          }
        }
      }
    } catch { /* fall through */ }
    return undefined
  }

  // ---- 补丁层文本解析:只读取 insert 块里的条目,其余行一律原样保留 ----
  const TOP = /^-\s+([A-Za-z0-9_-]+):\s*$/
  const ITEM = /^(\s*)-\s+id:\s*(.*)$/
  const KEY = /^(\s*)(name|disabled):\s*(.*)$/

  function parsePatch(text) {
    const lines = text.split(/\r?\n/)
    const items = []
    for (let i = 0; i < lines.length; i++) {
      const top = TOP.exec(lines[i])
      if (top === null || top[1] !== 'insert') continue
      const blockHeader = i
      i++
      for (; i < lines.length; i++) {
        const nextTop = TOP.exec(lines[i])
        if (nextTop !== null) { i--; break }
        const itemStart = ITEM.exec(lines[i])
        if (itemStart === null) continue
        const idIndent = itemStart[1].length
        const item = { id: stripQuotes(itemStart[2]), name: undefined, disabled: false, blockHeader, startLine: i, endLine: i, idIndent }
        i++
        for (; i < lines.length; i++) {
          const endTop = TOP.exec(lines[i])
          if (endTop !== null) { i--; break }
          const nextItem = ITEM.exec(lines[i])
          if (nextItem !== null && nextItem[1].length <= idIndent) { i--; break }
          const key = KEY.exec(lines[i])
          if (key !== null && key[1].length === idIndent + 2) {
            if (key[2] === 'name') item.name = stripQuotes(key[3])
            if (key[2] === 'disabled') item.disabled = stripQuotes(key[3]) !== 'false'
          }
          const trimmed = lines[i].trim()
          if (trimmed !== '' && !trimmed.startsWith('#')) item.endLine = i
        }
        items.push(item)
      }
    }
    return items
  }

  // ---- 文件读写(全部经 fs 服务)----
  async function readTextIfExists(path) {
    try {
      const target = await fs.resolve(path)
      const info = await fs.stat(target)
      if (info === undefined || info.type !== 'file') return undefined
      return await fs.readText(target)
    } catch { return undefined }
  }

  async function readLines(path) {
    const text = await readTextIfExists(path)
    return text === undefined ? undefined : text.split(/\r?\n/)
  }

  // 会话策略解析:写入必须携带会话执行策略。fs-sandbox 后端在省略
  // sandboxPolicy 时回落到部署默认(workspace-write),会拒绝工作区外的
  // 补丁文件;带上会话后按会话自身策略(如 danger-full-access)正常围栏。
  function policyFor(sessionId) {
    if (sandboxPolicy === undefined) return undefined
    let session
    if (typeof sessionId === 'string' && sessionId !== '' && sessions !== undefined) {
      session = sessions.get(sessionId)
    }
    try {
      return session === undefined ? sandboxPolicy.resolve() : sandboxPolicy.resolve({ session })
    } catch { return undefined }
  }

  function policyHint(sessionId) {
    const policy = policyFor(sessionId)
    if (policy === undefined || policy.mode === 'danger-full-access') return ''
    return '当前会话文件策略为 ' + policy.mode + ',写入补丁层需要会话处于 danger-full-access(请在权限设置中切换后重试)'
  }

  async function writeLines(path, lines, sessionId) {
    const target = await fs.resolve(path)
    let out = lines.join('\n')
    if (!out.endsWith('\n')) out += '\n'
    await fs.writeText(target, out, undefined, undefined, policyFor(sessionId))
  }

  const patchPaths = (home) => home === undefined
    ? []
    : [home + '/profiles/web/cordis.patch.yml', home + '/cordis.patch.yml']

  // ---- 状态扫描 ----
  async function scanState(sessionId) {
    if (fs === undefined) return { ok: false, error: '文件服务(fs)不可用,无法管理插件' }
    const home = await locateHome()
    if (home === undefined) return { ok: false, error: '无法确定 DSH_HOME:settings 服务未提供文档路径,启动环境也没有 DSH_HOME' }
    const pluginDir = home + '/plugins'

    let pluginDirExists = false
    const files = []
    try {
      const dirTarget = await fs.resolve(pluginDir)
      const dirInfo = await fs.stat(dirTarget)
      if (dirInfo !== undefined && dirInfo.type === 'directory') {
        pluginDirExists = true
        const entries = await fs.listDir(dirTarget)
        for (const entry of entries) {
          if (entry.type === 'file' && /\.(mjs|cjs|js)$/i.test(entry.name)) {
            files.push({ name: entry.name, url: fs.fileUrl(entry.target), size: entry.size })
          }
        }
        files.sort((a, b) => a.name.localeCompare(b.name))
      }
    } catch { /* 目录不可读按空列表处理 */ }

    const paths = patchPaths(home)
    const patchFiles = []
    const rows = []
    for (const path of paths) {
      const text = await readTextIfExists(path)
      patchFiles.push({ path, exists: text !== undefined })
      if (text === undefined) continue
      for (const item of parsePatch(text)) {
        rows.push({ id: item.id, name: item.name, disabled: item.disabled, source: path })
      }
    }

    const plugins = files.map((file) => {
      const row = rows.find((candidate) => sameName(candidate.name, file.url))
      return {
        file: file.name,
        url: file.url,
        size: file.size,
        id: row === undefined ? undefined : row.id,
        mounted: row !== undefined,
        enabled: row !== undefined && !row.disabled,
        source: row === undefined ? undefined : row.source,
      }
    })

    const external = rows
      .filter((row) => !files.some((file) => sameName(row.name, file.url)))
      .map((row) => ({ id: row.id, name: row.name === undefined ? null : row.name, disabled: row.disabled, source: row.source }))

    const policy = policyFor(sessionId)
    return { ok: true, dshHome: home, pluginDir, pluginDirExists, policyMode: policy === undefined ? null : policy.mode, patchFiles, plugins, external }
  }

  // ---- 条目级变更:disable/enable/unmount 只动目标条目的行,其余行不动 ----
  const ID_OK = /^[A-Za-z0-9_-]{1,64}$/

  async function mutatePatch(id, source, kind, sessionId) {
    if (fs === undefined) return { ok: false, error: '文件服务(fs)不可用' }
    const home = await locateHome()
    if (home === undefined) return { ok: false, error: '无法确定 DSH_HOME' }
    if (!patchPaths(home).includes(source)) return { ok: false, error: '无效的补丁文件路径' }
    if (typeof id !== 'string' || !ID_OK.test(id)) return { ok: false, error: '无效的条目 id' }
    const lines = await readLines(source)
    if (lines === undefined) return { ok: false, error: '补丁文件不存在:' + source }
    const item = parsePatch(lines.join('\n')).find((candidate) => candidate.id === id)
    if (item === undefined) return { ok: false, error: '未在补丁层找到条目:' + id }

    if (kind === 'disable') {
      let done = false
      for (let j = item.startLine; j <= item.endLine; j++) {
        const m = KEY.exec(lines[j])
        if (m !== null && m[2] === 'disabled' && m[1].length === item.idIndent + 2) {
          lines[j] = ' '.repeat(item.idIndent + 2) + 'disabled: true'
          done = true
          break
        }
      }
      if (!done) lines.splice(item.startLine + 1, 0, ' '.repeat(item.idIndent + 2) + 'disabled: true')
    } else if (kind === 'enable') {
      for (let j = item.endLine; j >= item.startLine; j--) {
        const m = KEY.exec(lines[j])
        if (m !== null && m[2] === 'disabled' && m[1].length === item.idIndent + 2) {
          lines.splice(j, 1)
          break
        }
      }
    } else if (kind === 'unmount') {
      lines.splice(item.startLine, item.endLine - item.startLine + 1)
      let hasItems = false
      for (let j = item.blockHeader + 1; j < lines.length; j++) {
        if (TOP.exec(lines[j]) !== null) break
        if (ITEM.exec(lines[j]) !== null) { hasItems = true; break }
      }
      if (!hasItems) lines.splice(item.blockHeader, 1)
    } else {
      return { ok: false, error: '未知操作:' + kind }
    }
    await writeLines(source, lines, sessionId)
    return scanState(sessionId)
  }

  // ---- 挂载:在补丁层追加 insert 条目(loader 的官方 EntryOptions 形状)----
  function sanitizeId(basename) {
    let id = basename.replace(/\.(mjs|cjs|js)$/i, '').toLowerCase()
    id = id.replace(/[^a-z0-9-]+/g, '-').replace(/^-+/, '').replace(/-+$/, '')
    if (id === '') id = 'user-plugin'
    if (!/^[a-z]/.test(id)) id = 'plugin-' + id
    return id
  }

  async function mountPlugin(file, sessionId) {
    if (fs === undefined) return { ok: false, error: '文件服务(fs)不可用' }
    if (typeof file !== 'string' || file === '' || file === '.' || file === '..' || file.includes('/') || file.includes('\\')) {
      return { ok: false, error: '无效的文件名' }
    }
    if (!/\.(mjs|cjs|js)$/i.test(file)) return { ok: false, error: '仅支持 .mjs/.js/.cjs 插件文件' }
    const home = await locateHome()
    if (home === undefined) return { ok: false, error: '无法确定 DSH_HOME' }
    const fileTarget = await fs.resolve(home + '/plugins/' + file)
    const fileInfo = await fs.stat(fileTarget)
    if (fileInfo === undefined || fileInfo.type !== 'file') {
      return { ok: false, error: '插件文件不存在:' + home + '/plugins/' + file }
    }
    const url = fs.fileUrl(fileTarget)

    const paths = patchPaths(home)
    const allIds = []
    let source
    for (const path of paths) {
      const text = await readTextIfExists(path)
      if (text === undefined) continue
      if (source === undefined) source = path
      for (const item of parsePatch(text)) {
        allIds.push(item.id)
        if (sameName(item.name, url)) {
          return { ok: false, error: '该文件已挂载(条目 id:' + item.id + ')' }
        }
      }
    }
    if (source === undefined) source = paths[paths.length - 1]

    let base = sanitizeId(file)
    let id = base
    let n = 2
    while (allIds.includes(id)) { id = base + '-' + n; n++ }

    const existing = await readLines(source)
    const next = existing === undefined
      ? ['# dsh 用户插件补丁层(由“设置 → 插件 → 用户插件”页管理)。', '# 顶层 YAML 数组:loader 补丁条目(insert/覆盖/disable 列表)。', '']
      : existing
    while (next.length > 0 && next[next.length - 1].trim() === '') next.pop()
    next.push('', '- insert:', '    - id: ' + id, "      name: '" + url + "'")
    await writeLines(source, next, sessionId)
    return scanState(sessionId)
  }

  function failure(error, sessionId) {
    const hint = policyHint(sessionId)
    return { ok: false, error: errorOf(error) + (hint === '' ? '' : '。' + hint) }
  }

  // ---- HTTP 路由 ----
  const json = (res, value) => {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(value))
  }

  const route = (path, handler) => ctx.webServer.register({
    kind: 'exact',
    path,
    handler: (req, res) => {
      const query = new URL(req.url ?? '/', 'http://dsh.local').searchParams
      void Promise.resolve()
        .then(() => handler(query))
        .then((value) => json(res, value))
        .catch((error) => json(res, failure(error, query.get('sessionId'))))
    },
  })

  ctx.effect(() => {
    const disposes = [
      route('/dsh-user-plugins/state', (query) => scanState(query.get('sessionId'))),
      route('/dsh-user-plugins/mount', (query) => mountPlugin(query.get('file'), query.get('sessionId'))),
      route('/dsh-user-plugins/unmount', (query) => mutatePatch(query.get('id'), query.get('source'), 'unmount', query.get('sessionId'))),
      route('/dsh-user-plugins/enable', (query) => mutatePatch(query.get('id'), query.get('source'), 'enable', query.get('sessionId'))),
      route('/dsh-user-plugins/disable', (query) => mutatePatch(query.get('id'), query.get('source'), 'disable', query.get('sessionId'))),
    ]
    return () => {
      for (const dispose of disposes) dispose()
    }
  })
}
