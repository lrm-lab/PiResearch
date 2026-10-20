# PiResearch

带研究过程可视化的深度调研系统。提交问题后，主 Agent 拆解任务、分派研究、核验资料并生成报告。星图展示任务归属、执行状态和工具调用，报告支持 Markdown 阅读与自适应表格。

## 运行

需要 Python 3.12 和 uv。先安装运行时：

```bash
cd FrontierAgent
uv sync --extra eval
cd ..
```

按 [FrontierAgent 配置说明](FrontierAgent/README.md) 和环境变量示例配置本地模型、搜索服务凭证。主页研究进程读取项目根目录的 `.env`，需配置 `OPENAI_API_KEY`、`OPENAI_MODEL`、`OPENAI_BASE_URL` 和搜索凭证；代理与服务端配置见 `FrontierAgent/.env.example` 及 `FrontierAgent/workflows/agent_team/profiles/drb2_deepseek_v2.yaml`。

启动主页：

```bash
PYTHONPATH=".:FrontierAgent" FrontierAgent/.venv/bin/python -m constellation.serve --home runs --host 127.0.0.1 --port 8765
```

访问 <http://127.0.0.1:8765/>。Enter 提交问题，Shift+Enter 换行。研究会调用已配置的模型和搜索服务。

## 目录

| 路径 | 内容 |
|---|---|
| `constellation/` | 主页、星图、报告阅读器、本地服务与布局 |
| `FrontierAgent/` | Agent 运行时、研究工作流、工具和测试 |
| `drb2-evaluator/` | DeepResearch Bench II 评测工具与数据 |
| `docs/` | 星图设计与实现说明 |
| `run_frontier_benchmark.sh` | 批量研究与评测入口 |

研究过程写入本地 `runs/`，包含任务板、星图、轨迹和报告。仓库不包含运行历史、真实密钥、虚拟环境或缓存。

父子关系表示任务包含关系。主 Agent 在规划结束前复核非主节点下的归属；明确误挂的并列任务或前置依赖可移回主问题，不确定关系保留。程序校验依据、版本和结构，记录修改历史。语义判断仍依赖 Agent。

研究结果采用串行随机抽样挑战：从已完成且未检查的研究任务中抽取一个，由独立挑战者查证；未发现实质问题就停止，确认错误后修正原任务再抽下一个，最多 5 个挑战节点。证据不足或挑战失败会记录为未形成结论，不冒充通过。抽查不能证明全部结论正确，最终报告仍检查覆盖范围和一致性。

独立核验在首批研究结果返回后开始，与其余研究交错进行，复用核验角色分批检查。`record_review` 从核验任务负责人的实际报告读取逐条结论：检查过的对象记录审核线，所检查断言全部得到证据确认才增加支持线；证据不足保留审核与不确定性，确认错误则重开原任务修正。图中保存审核证据、报告摘要哈希和历史，新任务结束前检查已完成的核验任务是否记录关系。审核范围和语义判断仍由 Agent 负责，不设关系数量指标，不给历史任务补画未经执行的关系。

## 测试

```bash
cd FrontierAgent
uv sync --extra dev
cd ..
PYTHONPATH=".:FrontierAgent" FrontierAgent/.venv/bin/python -m pytest constellation FrontierAgent/tests/test_constellation.py FrontierAgent/tests/test_constellation_prompt.py FrontierAgent/tests/test_constellation_review.py -q
node --test constellation/test_report_tables.mjs
```

基准运行方式见 [FRONTIER_AGENT_DRB2.md](FRONTIER_AGENT_DRB2.md)。所含组件与数据的授权分别见各目录内的 LICENSE、DATA_LICENSE 文件。

## 页面性能与部署

页面和 API 由同一个服务提供；HTML 中的 CSS/JS 已内联，无需另行引入前端框架或运行开发构建服务器。服务使用 HTTP/1.1，支持 gzip、ETag 条件请求与 `private, no-cache` 重新验证，页面更新后会读取新版本。`systemd` 继续负责进程管理；也可放到现有反向代理后面，避免对动态 API 设置长期共享缓存。

星图按任务缓存，依据星图、任务板、会话、轨迹及报告的文件标识、大小和纳秒修改时间失效；轨迹超时边界也会失效。同一任务的并发读取合并为一次构建，缓存数量受限。完整 `/view` 接口保持兼容，页面使用以下接口：

- `/api/studies/<id>/thumbnail`：首页缩略图所需的几何、颜色和连线。
- `/api/studies/<id>/snapshot`：节点状态、布局、工具数量及详情版本，不含工具步骤正文。
- `/api/studies/<id>/node?id=<node-id>`：点选节点后获取该节点的工具步骤。

单任务模式提供对应的 `/api/thumbnail`、`/api/snapshot` 和 `/api/node`。首页仅轮询可见且进行中的缩略图；详情页任务完成后停止轮询，后台标签页暂停请求，返回页面时重新确认状态。网络失败有退避与超时，保留已显示的数据。鼠标悬停或键盘聚焦任务时预取摘要，沿用缩略图到星图的衔接动效；绘图复用未变化的节点、连线及工具气泡。

性能与布局回归测试：

```bash
FrontierAgent/.venv/bin/python -m pytest constellation -q
node --test constellation/test_*.mjs
# 浏览器集成测试需要已安装的 Puppeteer 和其 Chromium；环境变量填该模块的绝对路径。
PIRESEARCH_PUPPETEER_MODULE=/absolute/path/to/puppeteer.js \
  node --test constellation/test_performance_browser.mjs constellation/test_report_layout_browser.mjs
```
