# PiResearch Galaxy

全新的 3D 前端：每次研究是一个可以飞进去看的星系。与现有 2D 页面并存，不修改 `constellation/` 和任何后端接口。设计说明见 [DESIGN.md](DESIGN.md)。

- `/galaxy/`：3D 首页。每项研究是一颗漂浮的小星系，可以在这里提交新问题或删除研究。
- `/galaxy/study/<id>`：3D 研究详情。包括星图、详情面板、核验透镜和报告阅读。
- 2D 与 3D 互相切换：3D 首页的「经典 2D 版」指向 `/index.html`（生产环境 `/` 会被 Caddy 重定向回 `/galaxy/`），3D 研究页顶栏的「2D 视图」指向 `/study/<id>`；2D 页面上由 `serve.py` 注入「切换到 3D」按钮。

## 运行

需要 Node 20+ 和 pnpm；服务端只用 Python 3.9+ 标准库。

1. 照常启动现有服务（见仓库根目录 README），例如：

   ```bash
   PYTHONPATH=".:FrontierAgent" FrontierAgent/.venv/bin/python -m constellation.serve --home runs --host 127.0.0.1 --port 8765
   ```

2. 构建并启动 Galaxy：

   ```bash
   cd galaxy
   pnpm install
   pnpm build
   python3 serve.py --upstream http://127.0.0.1:8765 --host 127.0.0.1 --port 8766
   ```

3. 访问 <http://127.0.0.1:8766/galaxy/>。

`serve.py` 托管 `dist/` 下的 `/galaxy/*`，其余请求（`/api/*`、2D 页面 `/` 和 `/study/*`）转发给 `--upstream`，包括 ETag/304 和 gzip。只有 2D 页面的 HTML（`/`、`/index.html`、`/study/<id>`）会被改动：以不压缩的方式取回，在 `</body>` 前注入一个「切换到 3D」按钮，并把指向 `/` 的链接改为 `/index.html`，让 2D 内部导航留在 2D；这些页面的 ETag 加上后缀（随注入片段变化），304 也按此后缀判断。其他响应逐字节不变。带哈希的静态资源长期缓存，`index.html` 每次重新验证。可以放在现有反向代理后面，也可以交给 systemd 管理。

## 开发

```bash
cd galaxy
pnpm dev            # Vite 开发服务器，/api 等请求代理到 GALAXY_UPSTREAM（默认 http://127.0.0.1:18765）
pnpm test           # 单元测试（vitest）
pnpm typecheck
python3 test_serve.py
```

无模型调用的测试数据：

```bash
mkdir -p /tmp/galaxy-runs
python3 galaxy/dev/make_fixture.py /tmp/galaxy-runs/runs   # 30 个任务、6 个 Agent、全部关系类型，还有进行中的工具调用
PYTHONPATH=. python3 -m constellation.serve --home /tmp/galaxy-runs/runs --port 18765
```

正在进行的工具调用会在轨迹文件修改 30 分钟后过期，重新运行脚本即可恢复。

仅在开发服务器上生效的首页调试参数：`?mockSubmit=1`、`?mockDelete=1`、`?mockEmpty=1`、`?navigate=0`。生产环境也可用的 `?nowebgl=1` 会强制使用 2D 卡片视图。注意：不带 mock 参数时，在首页提交问题会启动一次真实的研究。

## 目录

| 路径 | 内容 |
|---|---|
| `src/lib/` | 纯逻辑：坐标映射、轮询、标题、报告预处理，从 2D 页面移植，配有测试 |
| `src/store.ts` | 研究详情页状态（zustand） |
| `src/scene/` | 研究详情的 3D 场景：恒星、天体、关系光效、粒子、镜头、后期效果 |
| `src/ui/` | 研究详情的 HUD：顶栏、图例、详情面板、报告阅读器、提示、快捷键 |
| `src/home/` | 3D 首页：星系画廊、提交框、删除、无 WebGL 时的卡片视图 |
| `serve.py` | 独立静态服务与反向代理 |
| `dev/make_fixture.py` | 合成测试研究 |

快捷键（详情页）：`V` 核验透镜，`F` 回到主节点，`R` 重置视角，`Esc` 关闭，`?` 查看全部快捷键。
