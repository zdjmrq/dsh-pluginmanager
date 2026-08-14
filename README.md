# dsh-user-plugins-manager

在 DeepSeek Harness(DSH)的 **设置 → 插件** 里新增一个 **“用户插件”** 标签页,集中管理 `~/.dsh/plugins` 目录下的用户插件文件:挂载、停用、启用、卸载,全部通过写入 `cordis.patch.yml` 补丁层完成,由 DSH 的 HMR 监听器**热生效,无需重启**。

> A settings tab for DeepSeek Harness that manages user plugins in `~/.dsh/plugins` — mount / disable / enable / unmount through the `cordis.patch.yml` patch layer, applied live by DSH's HMR.

## 功能特性

- **插件目录视图**:扫描 `~/.dsh/plugins` 下的 `.mjs/.js/.cjs` 插件文件,显示每个文件的挂载状态(已启用 / 已停用 / 未挂载)与补丁条目 id;
- **一键挂载**:为未挂载的文件自动生成唯一 id 并在补丁层追加 `- insert:` 条目(`file:///` URL,loader 官方 `EntryOptions` 形状);
- **启用 / 停用**:写入或移除条目上的 `disabled: true` 行——loader 会跳过被停用的条目并释放其 fiber;
- **卸载**:移除补丁行,插件文件保留在目录中;
- **双补丁层感知**:同时读取 profile 级(`~/.dsh/profiles/web/cordis.patch.yml`)与 home 级(`~/.dsh/cordis.patch.yml`)补丁层,操作精确落在条目所在的文件上,其余行(含注释)原样保留;
- **沙箱合规**:所有写入经 DSH 的 `fs` 服务,并按“当前会话”解析出的沙箱策略围栏——会话是 `danger-full-access` 才允许写补丁层,`workspace-write` 下会被正确拒绝并在页面提示;
- **零依赖、零构建**:宿主半是纯 ESM、客户端半是手写的 module-loader bundle,直接 `file:` 安装即可。

## 安装

```bash
# 1) 将本插件作为依赖装入 web profile
dsh plugin --profile web add "file:<本仓库路径>"

# 2) 若 dsh CLI 不可用,可手动等价操作:
cd ~/.dsh/profiles/web
pnpm add "file:<本仓库路径>"
# 然后在 package.json 的 dsh.profile.bundles 末尾追加:
#   "dsh-user-plugins-manager"
```

重启 DSH 后生效:打开 **设置 → 插件 → 用户插件** 即可看到管理页面。

## 使用

1. 把插件文件(如 `my-plugin.mjs`)放入 `~/.dsh/plugins/`;
2. 打开 设置 → 插件 → 用户插件,点 **刷新**;
3. 点 **挂载** 上线;随时可 **停用 / 启用 / 卸载**;
4. 修改会写入 `cordis.patch.yml` 并热重载,任务栏/会话无需重启。

## 工作原理

- DSH 用 loader 补丁层组合插件树:用户层是 `~/.dsh/profiles/web/cordis.patch.yml` 与 `~/.dsh/cordis.patch.yml`,顶层 YAML 数组里 `- insert:` 条目即为挂载(条目字段:`id` / `name` / `disabled` 等);
- 本插件宿主半通过 `webServer` 注册 `/dsh-user-plugins/*` JSON 路由,对补丁文件做**行级文本手术**(只动目标条目,注释与其他块原样保留);
- DSH 的 CLI 对 `cordis.patch.yml` 有 HMR 监听,文件保存后 loader 热重载组合树;
- 客户端半注册官方 Slot `settings.plugins.tab`(`id: "user-plugins"`,与内置“已配置/全部”标签页并列,零覆盖内置 UI)。

## 目录结构

```
src/index.js        # 宿主半:JSON 管理路由 + 补丁层读写(经 fs 服务,按会话沙箱策略围栏)
client/client.js    # 客户端半:设置页标签与 UI(手写 module-loader bundle)
cordis.patch.yml    # bundle 补丁:把宿主半插入组合树
package.json        # dsh.bundle.patch + dsh.client 声明
```

## License

MIT
