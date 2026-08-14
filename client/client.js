// dsh-user-plugins-manager — Client half(预构建 module-loader bundle,零构建)
//
// 注册到 设置 → 插件 的“用户插件”标签页。页面分三组:
//   ① 插件目录(~/.dsh/plugins)散件:挂载 / 卸载 / 启用 / 停用;
//   ② 运行树其他插件(部署、插件包、动态挂载):按条目 id 停用 / 启用
//     (停用 = 向用户补丁层写顶层“停用覆盖”裸行,删除即恢复);
//   ③ 已安装的 npm 插件包(profile node_modules 里声明 dsh.bundle.patch
//     的包):显示安装/挂载来源,未挂载的一键按包名挂载进补丁层。
// 数据来自宿主半的 /dsh-user-plugins/{state,loader,packages,...} JSON 路由;
// 宿主半未升级(缺少新路由)时自动降级为旧版行为,不报错。
window.__ModuleLoader__.load({
  id: "dsh-user-plugins-manager",
  factory: (require) => {
    const React = require("react")
    var module = { exports: {} }
    var exports = module.exports

    const CSS =
      ".upm-root{display:flex;flex-direction:column;gap:12px;max-width:760px}" +
      ".upm-head{display:flex;align-items:center;gap:12px}" +
      ".upm-title{font-weight:600;flex:1}" +
      ".upm-subtitle{font-size:13px;font-weight:600}" +
      ".upm-count{font-size:11px;color:var(--dsw-alias-label-secondary);margin-left:6px}" +
      ".upm-meta{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.7;overflow-wrap:anywhere}" +
      ".upm-meta code{font-family:ui-monospace,Consolas,monospace}" +
      ".upm-warn{font-size:12px;color:var(--dsw-alias-state-warn-primary);line-height:1.7;overflow-wrap:anywhere}" +
      ".upm-card{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);padding:4px 12px}" +
      ".upm-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}" +
      ".upm-row:last-child{border-bottom:none}" +
      ".upm-info{flex:1;min-width:0}" +
      ".upm-name{font-size:13px;font-weight:600;overflow-wrap:anywhere}" +
      ".upm-file{font-size:11px;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,Consolas,monospace;overflow-wrap:anywhere;margin-top:2px}" +
      ".upm-badge{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid currentColor;white-space:nowrap}" +
      ".upm-badge-on{color:var(--dsw-alias-state-success-primary)}" +
      ".upm-badge-off{color:var(--dsw-alias-state-warn-primary)}" +
      ".upm-badge-none{color:var(--dsw-alias-label-secondary)}" +
      ".upm-actions{display:flex;gap:6px;margin-left:auto;flex-wrap:wrap;justify-content:flex-end}" +
      ".upm-btn{font-size:12px;padding:3px 10px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer}" +
      ".upm-btn:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}" +
      ".upm-btn:disabled{opacity:.5;cursor:default}" +
      ".upm-btn-primary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}" +
      ".upm-btn-danger{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}" +
      ".upm-error{color:var(--dsw-alias-state-error-primary);font-size:12px}" +
      ".upm-empty{color:var(--dsw-alias-label-secondary);font-size:12px;padding:8px 0}" +
      ".upm-note{font-size:11px;color:var(--dsw-alias-label-secondary);line-height:1.7;border-left:2px solid var(--dsw-alias-border-l2);padding-left:10px}"

    const TAG_ID = "dsh-user-plugins-manager/style"
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(TAG_ID) + "]") === null) {
      const tag = document.createElement("style")
      tag.dataset.plugin = "dsh-user-plugins-manager"
      tag.dataset.pluginCss = TAG_ID
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    const e = React.createElement

    const PHASE_TEXT = { pending: "等待中", loading: "加载中", active: "运行中", failed: "加载失败", unloading: "卸载中" }

    function moduleShortName(name) {
      if (name === undefined || name === null) return ""
      let s = String(name)
      if (s.indexOf("@") === 0) {
        const slash = s.indexOf("/")
        if (slash >= 0) s = s.slice(slash + 1)
      }
      return s.replace(/^cordis:/, "").replace(/^cordis-plugin-/, "").replace(/^dsh-(host-|client-)?/, "")
    }

    function Badge(props) {
      return e("span", { key: props.key, className: "upm-badge upm-badge-" + props.tone }, props.text)
    }

    function PhaseBadge(phase) {
      if (phase === null || phase === undefined || PHASE_TEXT[phase] === undefined) return null
      return Badge({ key: "phase", tone: phase === "failed" ? "off" : "none", text: PHASE_TEXT[phase] })
    }

    function ActionButton(props) {
      return e("button", {
        key: props.key,
        type: "button",
        className: "upm-btn" + (props.tone === "primary" ? " upm-btn-primary" : props.tone === "danger" ? " upm-btn-danger" : ""),
        disabled: props.busy === true,
        onClick: props.onClick,
      }, props.label)
    }

    // 把 /state 的目录行 + /loader 的运行树条目合并成第二组(其他插件):
    // 运行树条目按 id 吸收 external 补丁行的 source;external 行若不在运行树
    // 里(悬空)也保留展示。目录散件的条目属于第一组,这里跳过。
    function buildOtherItems(data, loaderData) {
      const items = []
      const byId = new Map()
      const dirIds = new Set()
      for (const plugin of data.plugins || []) {
        if (plugin.mounted && plugin.id !== undefined) dirIds.add(plugin.id)
      }
      const entries = loaderData !== null && loaderData.ok === true ? (loaderData.entries || []) : []
      for (const entry of entries) {
        if (entry.entryId !== undefined && dirIds.has(entry.entryId)) continue
        const item = Object.assign({}, entry, { source: undefined, dangling: false })
        items.push(item)
        byId.set(entry.entryId, item)
      }
      for (const row of data.external || []) {
        if (dirIds.has(row.id)) continue
        const existing = byId.get(row.id)
        if (existing !== undefined) { existing.source = row.source; continue }
        items.push({ entryId: row.id, moduleName: row.name === null ? undefined : row.name, enabled: !row.disabled, fiberPhase: null, source: row.source, dangling: true })
      }
      items.sort((a, b) => String(a.entryId).localeCompare(String(b.entryId)))
      return items
    }

    function ManagerView(props) {
      const useSessions = props.useSessions
      const currentSessionId = typeof useSessions === "function" ? useSessions((state) => state.current) : undefined
      const [data, setData] = React.useState(null)
      const [loaderData, setLoaderData] = React.useState(null)
      const [loaderError, setLoaderError] = React.useState(null)
      const [packagesData, setPackagesData] = React.useState(null)
      const [packagesError, setPackagesError] = React.useState(null)
      const [error, setError] = React.useState(null)
      const [busy, setBusy] = React.useState(false)

      function applyResult(result) {
        if (result !== null && result !== undefined && result.ok === true) {
          setData(result)
          setError(null)
        } else {
          const message = result === null || result === undefined ? "操作失败" : result.error
          setError(message || "操作失败")
        }
      }

      async function request(kind, payload) {
        const params = new URLSearchParams()
        const merged = Object.assign({ sessionId: currentSessionId }, payload)
        for (const key of Object.keys(merged)) {
          const value = merged[key]
          if (value !== undefined && value !== null && value !== "") params.set(key, String(value))
        }
        const text = params.toString()
        const response = await fetch("/dsh-user-plugins/" + kind + (text === "" ? "" : "?" + text), { cache: "no-store" })
        return await response.json()
      }

      function applyLoaderResult(snapshot) {
        if (snapshot !== null && snapshot !== undefined && snapshot.ok === true) {
          setLoaderData(snapshot)
          setLoaderError(null)
        } else if (snapshot !== null && snapshot !== undefined) {
          setLoaderError(snapshot.error || "不可用")
        }
      }

      function applyPackagesResult(snapshot) {
        if (snapshot !== null && snapshot !== undefined && snapshot.ok === true) {
          setPackagesData(snapshot)
          setPackagesError(null)
        } else if (snapshot !== null && snapshot !== undefined) {
          setPackagesError(snapshot.error || "不可用")
        }
      }

      async function refresh() {
        setBusy(true)
        await Promise.all([
          request("state", {}).then(
            (result) => { applyResult(result) },
            (err) => { setError("读取失败:" + String(err && err.message ? err.message : err)) },
          ),
          request("loader", {}).then(
            (snapshot) => { applyLoaderResult(snapshot) },
            (err) => { setLoaderError("运行树不可用:" + String(err && err.message ? err.message : err)) },
          ),
          request("packages", {}).then(
            (snapshot) => { applyPackagesResult(snapshot) },
            (err) => { setPackagesError("清单不可用:" + String(err && err.message ? err.message : err)) },
          ),
        ])
        setBusy(false)
      }

      async function act(kind, payload) {
        setBusy(true)
        let result
        try { result = await request(kind, payload) }
        catch (err) {
          setError("操作失败:" + String(err && err.message ? err.message : err))
          setBusy(false)
          return
        }
        applyResult(result)
        // 停用/启用/挂载/卸载会经 HMR 重载运行树与补丁层,稍后再拉一次快照。
        setTimeout(() => {
          void request("loader", {}).then(
            (snapshot) => { applyLoaderResult(snapshot) },
            () => { /* 保持上一次快照 */ },
          )
          void request("packages", {}).then(
            (snapshot) => { applyPackagesResult(snapshot) },
            () => { /* 保持上一次快照 */ },
          )
        }, 700)
        setBusy(false)
      }

      function confirmDisable(item) {
        if (item.source !== undefined && item.source !== null && item.source !== "") return true
        if (typeof window === "undefined" || typeof window.confirm !== "function") return true
        return window.confirm(
          "该插件由 dsh 部署或插件包提供。停用会向用户补丁层写入停用覆盖(" + item.entryId + "),保存后立即生效;" +
          "若停用的是本管理器自身,本页会随之中断,恢复方法:手动删除 ~/.dsh/profiles/web/cordis.patch.yml 中对应的停用两行后刷新页面。确定停用吗?",
        )
      }

      React.useEffect(() => { void refresh() }, [currentSessionId])

      const rows = []
      rows.push(e("div", { key: "head", className: "upm-head" },
        e("div", { className: "upm-title" }, "用户插件(DSH_HOME)"),
        e("button", { type: "button", className: "upm-btn", disabled: busy, onClick: () => { void refresh() } }, "刷新"),
      ))
      if (error !== null) rows.push(e("div", { key: "error", className: "upm-error" }, error))

      if (data === null) {
        rows.push(e("div", { key: "loading", className: "upm-empty" }, "正在读取…"))
      } else {
        rows.push(e("div", { key: "meta", className: "upm-meta" },
          e("div", null, "插件目录: ", e("code", null, data.pluginDir), data.pluginDirExists ? "" : "(不存在,请先创建该目录)"),
        ))
        for (let index = 0; index < data.patchFiles.length; index++) {
          const patch = data.patchFiles[index]
          rows.push(e("div", { key: "patch-" + index, className: "upm-meta" },
            "补丁层: ", e("code", null, patch.path), patch.exists ? "" : "(未创建,首次挂载时自动创建)",
          ))
        }
        rows.push(e("div", { key: "policy", className: data.policyMode === "danger-full-access" ? "upm-meta" : "upm-warn" },
          "当前会话文件策略: ", e("code", null, data.policyMode === null ? "未知" : data.policyMode),
          data.policyMode === "danger-full-access" ? "" : "(写入补丁层需要 danger-full-access,请在权限设置中切换)",
        ))

        const loaderEntries = loaderData !== null && loaderData.ok === true ? (loaderData.entries || []) : []

        // ---- 第一组:插件目录散件 ----
        rows.push(e("div", { key: "dir-title", className: "upm-subtitle" },
          "插件目录(DSH_HOME/plugins)",
          e("span", { className: "upm-count" }, data.plugins.length + " 个文件"),
        ))
        const pluginRows = data.plugins.map((plugin) => {
          const runtime = loaderEntries.find((entry) => entry.entryId === plugin.id)
          const badge = plugin.mounted
            ? (plugin.enabled ? Badge({ key: "badge", tone: "on", text: "已启用" }) : Badge({ key: "badge", tone: "off", text: "已停用" }))
            : Badge({ key: "badge", tone: "none", text: "未挂载" })
          const actions = plugin.mounted
            ? (plugin.enabled
                ? [
                    ActionButton({ key: "disable", label: "停用", busy, onClick: () => { void act("disable", { id: plugin.id, source: plugin.source }) } }),
                    ActionButton({ key: "unmount", label: "卸载", tone: "danger", busy, onClick: () => { void act("unmount", { id: plugin.id, source: plugin.source }) } }),
                  ]
                : [
                    ActionButton({ key: "enable", label: "启用", tone: "primary", busy, onClick: () => { void act("enable", { id: plugin.id, source: plugin.source }) } }),
                    ActionButton({ key: "unmount", label: "卸载", tone: "danger", busy, onClick: () => { void act("unmount", { id: plugin.id, source: plugin.source }) } }),
                  ])
            : [ActionButton({ key: "mount", label: "挂载", tone: "primary", busy, onClick: () => { void act("mount", { file: plugin.file }) } })]
          return e("div", { key: "plugin-" + plugin.file, className: "upm-row" },
            e("div", { className: "upm-info" },
              e("div", { className: "upm-name" }, plugin.file),
              e("div", { className: "upm-file" }, plugin.mounted ? "id: " + plugin.id + " · " + plugin.url : plugin.url),
            ),
            badge,
            PhaseBadge(runtime === undefined ? null : runtime.fiberPhase),
            e("div", { className: "upm-actions" }, actions),
          )
        })
        rows.push(e("div", { key: "plugins-card", className: "upm-card" },
          pluginRows.length === 0
            ? e("div", { className: "upm-empty" }, "插件目录里还没有插件文件。将 .mjs/.js/.cjs 插件文件放入该目录后点“刷新”,再点“挂载”。")
            : pluginRows,
        ))

        // ---- 第二组:运行树中的其他插件(部署 / 插件包 / 动态挂载)----
        const loaderAvailable = loaderData !== null && loaderData.ok === true
        const otherItems = buildOtherItems(data, loaderData)
        rows.push(e("div", { key: "other-title", className: "upm-subtitle" },
          "其他已挂载插件(Loader 运行树)",
          e("span", { className: "upm-count" }, otherItems.length + " 个条目"),
        ))
        if (!loaderAvailable && loaderError !== null) {
          rows.push(e("div", { key: "loader-hint", className: "upm-warn" },
            loaderError, "(运行树接口由宿主半插件提供,更新插件后重启 dsh 即可;未升级时以下只显示补丁层自有条目)",
          ))
        }
        const otherRows = otherItems.map((item) => {
          const title = moduleShortName(item.moduleName)
          const badge = item.enabled ? Badge({ key: "badge", tone: "on", text: "已启用" }) : Badge({ key: "badge", tone: "off", text: "已停用" })
          const own = item.source !== undefined && item.source !== null && item.source !== ""
          const actions = item.enabled
            ? [ActionButton({ key: "disable", label: "停用", busy, onClick: () => { if (!confirmDisable(item)) return; void act("disable", { id: item.entryId, source: item.source }) } })]
            : [ActionButton({ key: "enable", label: "启用", tone: "primary", busy, onClick: () => { void act("enable", { id: item.entryId, source: item.source }) } })]
          if (own && !item.enabled) {
            actions.push(ActionButton({ key: "unmount", label: "卸载", tone: "danger", busy, onClick: () => { void act("unmount", { id: item.entryId, source: item.source }) } }))
          }
          return e("div", { key: "other-" + item.entryId, className: "upm-row" },
            e("div", { className: "upm-info" },
              e("div", { className: "upm-name" }, title === "" ? item.entryId : title),
              e("div", { className: "upm-file" },
                "id: " + item.entryId + " · " + (item.moduleName === undefined || item.moduleName === null ? "(未声明 name)" : item.moduleName) +
                (own ? " · 补丁: " + item.source : "") +
                (loaderAvailable && item.dangling ? " · (未在运行树中)" : ""),
              ),
            ),
            badge,
            PhaseBadge(item.fiberPhase),
            e("div", { className: "upm-actions" }, actions),
          )
        })
        rows.push(e("div", { key: "other-card", className: "upm-card" },
          otherRows.length === 0
            ? e("div", { className: "upm-empty" }, "运行树里没有其他挂载的插件。")
            : otherRows,
        ))

        // ---- 第三组:已安装的 npm 插件包 ----
        const packagesAvailable = packagesData !== null && packagesData.ok === true
        const packageItems = packagesAvailable ? (packagesData.packages || []) : []
        rows.push(e("div", { key: "pkg-title", className: "upm-subtitle" },
          "已安装的 npm 插件包(profile/node_modules)",
          e("span", { className: "upm-count" }, packagesAvailable ? packageItems.length + " 个包" : "—"),
        ))
        if (!packagesAvailable && packagesError !== null) {
          rows.push(e("div", { key: "pkg-hint", className: "upm-warn" },
            packagesError, "(该接口由宿主半插件提供,更新插件后重启 dsh 即可)",
          ))
        }
        if (packagesAvailable) {
          const pkgRows = packageItems.map((item) => {
            const badge = item.mounted === "bundle"
              ? Badge({ key: "badge", tone: "on", text: "全局挂载" })
              : item.mounted === "patch"
                ? Badge({ key: "badge", tone: "on", text: "补丁层挂载" })
                : Badge({ key: "badge", tone: "none", text: "已安装未挂载" })
            const actions = item.mounted === "bundle"
              ? [e("span", { key: "hint", className: "upm-meta" }, "启停见“其他已挂载插件”组(重启 dsh 后出现)")]
              : item.mounted === "patch"
                ? [ActionButton({ key: "unmount", label: "卸载", tone: "danger", busy, onClick: () => { void act("unmount", { id: item.patchId, source: item.patchSource }) } })]
                : [ActionButton({ key: "mount", label: "挂载", tone: "primary", busy, onClick: () => { void act("mount", { pkg: item.name }) } })]
            return e("div", { key: "pkg-" + item.name, className: "upm-row" },
              e("div", { className: "upm-info" },
                e("div", { className: "upm-name" }, item.name),
                e("div", { className: "upm-file" },
                  "v" + (item.version === null ? "?" : item.version) +
                  (item.specifier === null ? "" : " · 依赖: " + item.specifier)),
              ),
              badge,
              e("div", { className: "upm-actions" }, actions),
            )
          })
          rows.push(e("div", { key: "pkg-card", className: "upm-card" },
            pkgRows.length === 0
              ? e("div", { className: "upm-empty" }, "profile 里还没有安装 dsh 插件包(用 pnpm add 安装后点“刷新”)。")
              : pkgRows,
          ))
        }

        rows.push(e("div", { key: "note", className: "upm-note" },
          "本页管理三类插件:①插件目录散件——挂载/卸载/启用/停用直接改补丁层条目;②运行树其他插件(部署、插件包等)——按条目 id 写“停用覆盖”裸行,删除即恢复;③已安装的 npm 插件包——未挂载的按包名挂载进补丁层(HMR 热生效),已由 bundles 全局挂载的以运行树为准。两个补丁文件都被 dsh HMR 监听,保存后热重载、无需重启;卸载只移除补丁行,文件/包保留。停用系统关键插件可能影响 dsh 功能,请谨慎操作。",
        ))
      }

      return e("div", { className: "upm-root" }, rows)
    }

    exports.name = "user-plugins-manager-client"
    exports.inject = ["slots"]
    exports.apply = function apply(ctx) {
      ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register(
        { name: "settings.plugins.tab", id: "user-plugins", order: 20, label: "用户插件" },
        (props) => e(ManagerView, props),
      ))
    }

    return module.exports
  },
})
