# PiResearch Prism

第三套前端：保留 3D 效果，视觉语言全部沿用 CoForge（配色、字体、圆角、明暗主题），放进 CoForge 的内容卡里就像它自己的页面。与 2D 页面和 Galaxy 并存，不修改 `constellation/`、`galaxy/` 和任何后端接口。设计说明见 [DESIGN.md](DESIGN.md)。

- `/prism/`：首页。顶部是 CoForge 首页的紫色丝绸渐变和提问框，下面每项研究是一张卡片，里面有一个 3D 迷你模型。
- `/prism/study/<id>`：研究详情。包括 3D 桌面模型（中间的玻璃棱镜是主问题，周围的 3D 卡片是任务）、任务列表、详情面板和报告。

## 运行

需要 Node 20+ 和 pnpm；服务端只用 Python 3.9+ 标准库。

1. 照常启动现有服务（见仓库根目录 README），例如：

   ```bash
   PYTHONPATH=".:FrontierAgent" FrontierAgent/.venv/bin/python -m constellation.serve --home runs --host 127.0.0.1 --port 8765
   ```

2. 构建并启动 Prism：

   ```bash
   cd prism
   pnpm install
   pnpm build
   python3 serve.py --upstream http://127.0.0.1:8765 --host 127.0.0.1 --port 8767
   ```

3. 访问 <http://127.0.0.1:8767/prism/>。

`serve.py` 和 `galaxy/serve.py` 是同一套写法：托管 `dist/` 下的 `/prism/*`，其余请求（`/api/*`、2D 页面）原样转发给 `--upstream`，包括 ETag/304 和 gzip。

## 嵌入 CoForge

在 CoForge 的内容卡里用 iframe 加载 `/prism/?theme=light` 或 `?theme=dark`。用户切换主题时，向 iframe 发一条消息即可，页面会平滑切换：

```js
iframe.contentWindow.postMessage({ type: "coforge:theme", theme: "dark" }, "*");
```

没有 `?theme=` 参数也没有收到消息时，跟随系统的明暗设置。页面没有自己的侧栏，高度撑满 iframe。

## 开发

```bash
cd prism
pnpm dev            # Vite 开发服务器，/api 等请求代理到 PRISM_UPSTREAM（默认 http://127.0.0.1:18765）
pnpm test           # 单元测试（vitest）
pnpm typecheck
python3 test_serve.py
```

无模型调用的测试数据：

```bash
mkdir -p /tmp/prism-runs
python3 prism/dev/make_fixture.py /tmp/prism-runs/runs   # 30 个任务、6 个 Agent、全部关系类型，还有进行中的工具调用
PYTHONPATH=. python3 -m constellation.serve --home /tmp/prism-runs/runs --port 18765
```

正在进行的工具调用会在轨迹文件修改 30 分钟后过期，重新运行脚本即可恢复。

仅在开发服务器上生效的调试参数：`?mockSubmit=1`、`?mockDelete=1`、`?mockEmpty=1`、`?navigate=0`。生产环境也可用的参数：`?nowebgl=1`（不用 WebGL）、`?theme=light|dark`。注意：不带 mock 参数时，在首页提交问题会启动一次真实的研究。

## 目录

| 路径 | 内容 |
|---|---|
| `src/styles/` | CoForge 的设计 token（语义颜色、字号、阴影）和共用动效（流光边框、闪光文字、光标） |
| `src/ui/` | 共用组件：按钮、徽标、任务状态环、Agent 头像、标签页、页头 |
| `src/lib/` | 纯逻辑：接口与轮询、主题同步、配色、状态映射、报告预处理，配有测试 |
| `src/scene/` | 研究详情的 3D 桌面模型：棱镜、任务卡片、关系光线、镜头、后期效果 |
| `src/study/` | 研究详情页：页头、工具栏、详情面板、任务列表、报告阅读器 |
| `src/home/` | 首页：渐变主视觉、提问框、研究卡片和 3D 迷你模型、删除 |
| `serve.py` | 独立静态服务与反向代理 |
| `dev/make_fixture.py` | 合成测试研究 |

快捷键（详情页）：`V` 核验透镜，`F` 回到主问题，`R` 重置视角，`Esc` 关闭，`1/2/3` 切换标签页，`?` 查看全部快捷键。
