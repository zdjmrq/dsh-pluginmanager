// dsh-user-plugins-manager — Client half(预构建 module-loader bundle,零构建)
//
// 注册到 设置 → 插件 的第三个标签页“用户插件”,通过 fetch 调用宿主半
// 的 /dsh-user-plugins/* JSON 路由,实现挂载 / 停用 / 启用 / 卸载。
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
      ".upm-actions{display:flex;gap:6px;margin-left:auto}" +
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

    function Badge(props) {
      return e("span", { key: props.key, className: "upm-badge upm-badge-" + props.tone }, props.text)
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

    function ManagerView(props) {
      const useSessions = props.useSessions
      const currentSessionId = typeof useSessions === "function" ? useSessions((state) => state.current) : undefined
      const [data, setData] = React.useState(null)
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

      async function refresh() {
        setBusy(true)
        try { applyResult(await request("state", {})) }
        catch (err) { setError("读取失败:" + String(err && err.message ? err.message : err)) }
        finally { setBusy(false) }
      }

      async function act(kind, payload) {
        setBusy(true)
        try { applyResult(await request(kind, payload)) }
        catch (err) { setError("操作失败:" + String(err && err.message ? err.message : err)) }
        finally { setBusy(false) }
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

        const pluginRows = data.plugins.map((plugin) => {
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
            e("div", { className: "upm-actions" }, actions),
          )
        })
        rows.push(e("div", { key: "plugins-card", className: "upm-card" },
          pluginRows.length === 0
            ? e("div", { className: "upm-empty" }, "插件目录里还没有插件文件。将 .mjs/.js/.cjs 插件文件放入该目录后点“刷新”,再点“挂载”。")
            : pluginRows,
        ))

        if (data.external.length > 0) {
          rows.push(e("div", { key: "ext-title", className: "upm-title" }, "补丁层中的其他挂载"))
          rows.push(e("div", { key: "ext-card", className: "upm-card" }, data.external.map((item) => e("div", { key: "ext-" + item.source + item.id, className: "upm-row" },
            e("div", { className: "upm-info" },
              e("div", { className: "upm-name" }, item.id),
              e("div", { className: "upm-file" }, item.name === null ? "(未声明 name)" : item.name),
            ),
            item.disabled ? Badge({ key: "badge", tone: "off", text: "已停用" }) : Badge({ key: "badge", tone: "on", text: "已启用" }),
            e("div", { className: "upm-actions" },
              item.disabled
                ? ActionButton({ key: "enable", label: "启用", tone: "primary", busy, onClick: () => { void act("enable", { id: item.id, source: item.source }) } })
                : ActionButton({ key: "disable", label: "停用", busy, onClick: () => { void act("disable", { id: item.id, source: item.source }) } }),
              ActionButton({ key: "unmount", label: "卸载", tone: "danger", busy, onClick: () => { void act("unmount", { id: item.id, source: item.source }) } }),
            ),
          ))))
        }

        rows.push(e("div", { key: "note", className: "upm-note" },
          "挂载/停用会写入 cordis.patch.yml 补丁层(用户层,应用在所有内置配置之上),写入按当前会话的文件沙箱策略围栏。运行中的 dsh 通过 HMR 监听该文件,保存后自动热重载、无需重启;卸载只移除补丁行,插件文件保留在目录中。",
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
