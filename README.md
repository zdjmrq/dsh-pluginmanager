# dsh-user-plugins-manager

> 仓库:https://github.com/zdjmrq/dsh-user-plugins-manager · 主题:`dsh-plugin`(Oh-My-DSH 生态可检索)

在 DeepSeek Harness(DSH)的 **设置 → 插件** 里新增一个 **“用户插件”** 标签页,把三种插件形态**统一在一个页面管理**:

1. **插件目录散件**(`~/.dsh/plugins` 下的 `.mjs/.js/.cjs` 文件):挂载、停用、启用、卸载;
2. **已安装的 npm 插件包**(profile `node_modules` 里声明 `dsh.bundle.patch` 的包):显示安装/挂载来源,未挂载的一键按包名挂载进补丁层;
3. **运行树其他插件**(部署、插件包、动态挂载等,与内置“全部”标签页同源):停用、启用,并显示实时运行状态(等待中 / 运行中 / 加载失败…)与来源徽章(自装 / 官方)。

所有操作都写入 `cordis.patch.yml` 补丁层,由 DSH 的 HMR 监听器**热生效,无需重启**。

> A settings tab for DeepSeek Harness that manages user plugin files in `~/.dsh/plugins` (mount / disable / enable / unmount), every other plugin in the live Loader tree (disable / enable by id override), and installed npm dsh plugin packages (mount / unmount by package name) — all through the `cordis.patch.yml` patch layer, applied live by DSH's HMR.

## 功能特性

- **插件目录视图**:扫描 `~/.dsh/plugins` 下的 `.mjs/.js/.cjs` 插件文件,显示每个文件的挂载状态(已启用 / 已停用 / 未挂载)与补丁条目 id;
- **一键挂载**:为未挂载的文件自动生成唯一 id 并在补丁层追加 `- insert:` 条目(`file:///` URL,loader 官方 `EntryOptions` 形状);
- **启用 / 停用**:写入或移除条目上的 `disabled: true` 行——loader 会跳过被停用的条目并释放其 fiber;
- **卸载**:移除补丁行,插件文件保留在目录中;
- **运行树视图**:新增 `/dsh-user-plugins/loader` 只读投影,直接读 `ctx.loader.entries()`(与内置“全部”标签页同源),把部署、插件包、动态挂载的插件也纳入本页:显示条目 id、模块名、有效启停状态与 fiber 阶段;
- **来源徽章**:运行树每条目标注**自装 / 官方**——自装 = 目录散件、用户补丁层条目、profile 安装的 npm 包;官方 = 随 dsh 部署自带(含运行时基础设施);
- **三组可折叠**:三个分组的标题行即折叠开关,默认折叠、点击展开/收起(展开状态在页面会话内保持),页面更清爽;
- **包插件的停用/启用**:对不在用户补丁层里的条目,按 id 写入顶层**停用覆盖裸行**(YAML `- id: x` + `disabled: true`,官方 patch 形状,即 telemetry 开关同款机制),删除该行即恢复——**不修改 node_modules、不破坏插件包**,重启后依然生效;
- **npm 插件包清单**:新增 `/dsh-user-plugins/packages` 路由,扫描 profile `node_modules` 里声明 `dsh.bundle.patch` 的包,显示包名/版本/依赖来源与挂载来源(bundles 全局 / 补丁层 / 未挂载);
- **npm 包一键挂载/卸载**:未挂载的包按**包名** `- insert:` 进补丁层(与文件挂载同机制,HMR 热生效,无需改 `dsh.profile.bundles`、无需重启);补丁层挂载的包可一键卸载;已在 bundles 里的包提示去运行树组管理启停;
- **双补丁层感知**:同时读取 profile 级(`~/.dsh/profiles/web/cordis.patch.yml`)与 home 级(`~/.dsh/cordis.patch.yml`)补丁层,操作精确落在条目所在的文件上,其余行(含注释)原样保留;
- **沙箱合规**:所有写入经 DSH 的 `fs` 服务,并按“当前会话”解析出的沙箱策略围栏——会话是 `danger-full-access` 才允许写补丁层,`workspace-write` 下会被正确拒绝并在页面提示;
- **优雅降级**:宿主半未升级(无 loader 路由)时页面自动退回旧版行为并给出提示,不会报错;
- **零依赖、零构建**:宿主半是纯 ESM、客户端半是手写的 module-loader bundle,`git+` / `file:` 直接安装即可,无需任何构建步骤。

## 安装

```bash
# 1) 把本插件作为依赖装入 web profile(推荐 git 安装:可随时升级、不依赖本地目录)
cd ~/.dsh/profiles/web
pnpm add "git+https://github.com/zdjmrq/dsh-user-plugins-manager.git"
# 2) 把包名追加进 package.json 的 dsh.profile.bundles 列表末尾:
#   "dsh-user-plugins-manager"
```

> 也支持本地目录安装:`pnpm add "file:<本仓库路径>"`(安装的是当时目录的快照,升级需重新 add)。

重启 DSH 后生效:打开 **设置 → 插件 → 用户插件** 即可看到管理页面。

## 使用

1. 把插件文件(如 `my-plugin.mjs`)放入 `~/.dsh/plugins/`;
2. 打开 设置 → 插件 → 用户插件,点 **刷新**;
3. **插件目录**组:点 **挂载** 上线;随时可 **停用 / 启用 / 卸载**;
4. **已安装的 npm 插件包**组:用 `pnpm add <包>` 装进 profile 的包会出现在这里——未挂载的点 **挂载**(按包名进补丁层,热生效),补丁层挂载的点 **卸载**,bundles 全局挂载的会提示去运行树组管理;
5. **其他已挂载插件**组:点 **停用** 关闭部署/包插件(会确认,并写入停用覆盖裸行),点 **启用** 恢复;状态徽章实时显示 Loader 中的运行阶段,来源徽章区分自装 / 官方;
6. 修改会写入 `cordis.patch.yml` 并热重载,任务栏/会话无需重启。

## 更新升级

- 宿主半(路由/管理逻辑)升级后需要**重启 DSH** 生效;客户端半(页面 UI)从磁盘下发,**Ctrl+F5 刷新即生效**;
- git 安装的升级方式(remove+add 会强制重取最新 commit):

```bash
cd ~/.dsh/profiles/web
pnpm remove dsh-user-plugins-manager
pnpm add "git+https://github.com/zdjmrq/dsh-user-plugins-manager.git"
```

## 卸载

```bash
cd ~/.dsh/profiles/web
pnpm remove dsh-user-plugins-manager
# 并从 package.json 的 dsh.profile.bundles 中移除 "dsh-user-plugins-manager"
```

插件写进 `cordis.patch.yml` 的条目(挂载行/停用覆盖行)会保留,是否清理由你决定。

## 与内置标签页的关系

- **已配置**:可展开的设置卡片,展示用户拥有设置命名空间的宿主插件;
- **全部**:只读清单,与本插件的“运行树”组同源(`ctx.loader.entries()`);
- **用户插件**(本插件):在“全部”基础上补齐**可操作性**——目录散件全生命周期、npm 包挂载/卸载、任意条目的停用/启用,并标注自装/官方来源。

## 已知限制

- **会话级插件不显示**:agent 预设(隔离域)与动态 Cordis 插件不在根 Loader 树里,与内置“全部”页一致;预设插件请到“预设”设置中管理;
- **只显示当前 profile**:页面展示当前 web 组合树(headless/tui 各自独立);
- **停用白名单**:条目 id 须匹配 `[A-Za-z0-9_-]{1,64}` 才能自动写覆盖行(部署行全部满足;个别运行时创建的行会提示手动编辑);
- **停用系统关键插件有风险**:页面会弹确认;停掉核心行(如 webserver)可能让页面不可用,恢复方法 = 删除补丁文件中的停用两行。

## 工作原理

- DSH 用 loader 补丁层组合插件树:用户层是 `~/.dsh/profiles/web/cordis.patch.yml` 与 `~/.dsh/cordis.patch.yml`,顶层 YAML 数组里 `- insert:` 条目即为挂载(条目字段:`id` / `name` / `disabled` 等);
- 补丁层按序应用(包层 → profile 层 → home 层 → overlay),后层可按 id 覆盖前层条目——所以用户层能停用任何包层挂载的插件,这正是内置 telemetry 开关使用的同款机制(`{ id, disabled: true }`);
- 本插件宿主半通过 `webServer` 注册 `/dsh-user-plugins/*` JSON 路由,对补丁文件做**行级文本手术**(只动目标条目,注释与其他块原样保留),并注入 `loader` 服务直读 `ctx.loader.entries()` 提供运行树投影;
- npm 包按**包名** `- insert:` 挂载,loader 从 profile 的 `node_modules` 解析(与 bundles 补丁的 `name` 字段同机制);包的客户端半经 `dsh.client` 声明,由内置 modules 插件扫描同一棵宿主树发现;
- DSH 的 CLI 对 `cordis.patch.yml` 有 HMR 监听,文件保存后 loader 热重载组合树;
- 客户端半注册官方 Slot `settings.plugins.tab`(`id: "user-plugins"`,与内置“已配置/全部”标签页并列,零覆盖内置 UI)。

## 目录结构

```
src/index.js        # 宿主半:JSON 管理路由 + 补丁层读写(经 fs 服务,按会话沙箱策略围栏)
client/client.js    # 客户端半:设置页标签与 UI(手写 module-loader bundle)
cordis.patch.yml    # bundle 补丁:把宿主半插入组合树
package.json        # dsh.bundle.patch + dsh.client 声明
```

## 📖 文字开源描述

本插件在「文字开源」枢纽仓库 [dsh-text-open-source](https://github.com/zdjmrq/dsh-text-open-source) 中配有完整描述（功能 / 技术路线 / 结构 / 关键实现 / 复刻提示词，不依赖代码即可复刻、便于理解与微调）：[plugins/dsh-user-plugins-manager.md](https://github.com/zdjmrq/dsh-text-open-source/blob/main/plugins/dsh-user-plugins-manager.md)。

## License

MIT
