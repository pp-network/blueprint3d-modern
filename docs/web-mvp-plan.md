# 给朋友用的 Web MVP 计划

目标：先做成 **本机可跑的工具**（`pnpm dev`），自己和朋友能画、能改错、能用 JSON 交换方案。  
公网部署、短链、登录都放到本地跑通之后。

**v0（第 0～4 周）** 本地编辑器能用手动画完。  
**v0.5（第 5 周）** 本地加 AI：白话描绘 → 可编辑 3D；知识写成 Skill，同一份以后灌进 Web 的 prompt 或 RAG。  
**Web 版** 本地验证后再做：部署、短链、把 Skill 正文装进线上接口。

账号、上传平面图自动识别、多层、报价仍不做。

---

## 1. 成功标准

本机跑起来后，满足下面全部才算 **本地 MVP** 过关：

1. `pnpm dev` 打开就能画，不用注册、不用公网。
2. 能对照户型图描墙（至少能导入一张平面图当底图）。
3. 画错能撤销，刷新不丢稿（自动保存）。
4. 能摆床、沙发、桌、柜、门、窗，尺寸能改。
5. 能导出 / 导入 JSON，换浏览器或发给朋友后能打开同一份。
6. 你自己先用它画完自己家。

不达标的典型情况：画错无法撤回、未点保存就丢、只能存在当前浏览器、离开这台机器就打不开。

---

## 2. 现状（fork 已有能力）

已经能用，不必重做：

| 能力 | 位置 | 说明 |
|---|---|---|
| 2D 画墙 / 3D 预览 | `src/floorplanner`, `src/three` | 画、移、删墙，有尺寸标注 |
| 家具目录 + 摆放 | `src/constants.ts` ITEMS | 床/柜/灯/桌椅/沙发/门窗，模型已是 **GLB** |
| GLB 加载 | `src/loaders/GLBLoader.ts`, `src/model/scene.ts` | 按扩展名分流，已接通 |
| 门窗贴墙 | `src/items/wall_item.ts` | 会吸附最近墙边 |
| 墙厚字段 | `src/model/wall.ts` | 默认 10cm，**没有逐墙编辑 UI** |
| 本地保存 | `app/services/storage.ts` | IndexedDB，无账号 |
| 中文界面 | `app/messages/zh.json` | en / zh / tw |
| 模板 | `src/templates/` | 空白或预置房间 |

明确没有、朋友会踩坑的：

- 撤销 / 重做
- 户型图底图 + 两点定比例
- 方案复制、JSON 导入导出
- 自动保存（关标签再开，未点保存就没了）
- 厨房、卫生间常用件偏少
- 公网短链 / 部署（本地阶段不做，不算缺口）

---

## 3. 范围

### 做（v0）

1. **撤销 / 重做**：墙和家具的增删改，Ctrl/Cmd+Z、Shift+Z。
2. **户型底图**：导入 PNG/JPG，调透明度，两点校准真实尺寸，锁定底图后描墙。
3. **自动保存 + 复制方案**：编辑中定时写入 IndexedDB；列表可复制一份再改。
4. **导入 / 导出 JSON**：本机换浏览器、微信传文件都能交换方案。
5. **墙厚可调**：选中墙后改厚度（模型已有字段）。
6. **自己先画一家**：用真实户型验收，缺什么家具再补 10～20 件，不扩成大目录。

本地阶段 **不做** 公网部署、短链、KV。朋友用 JSON 文件即可。

### 做（v0.5，第 5 周，仍在本地）

7. **白话生成方案（本地）**：本机对话框输入描述，读 Skill 当系统提示，模型输出合法场景 JSON，加载进编辑器，可手改、可撤销。密钥只在本机 `.env`。
8. **一键效果图（本地，可后置）**：3D 截图 + 提示词 → 生图 API，得到一张图。
9. **Scene Skill**：把 schema、单位、家具白名单、正反例写成项目 Skill。本地生成和以后 Web 的 prompt/RAG **共用这一份**。

不自己训 3D 模型。Skill **不是** 给朋友点的运行时；它是知识源。本地 Cursor 能直接用；Web 版把它的正文灌进 prompt，太长再改 RAG。

### 明确不做（本计划范围外）

| 不做 | 原因 |
|---|---|
| 注册 / 登录 / 云盘账号 | 朋友不会为试玩注册 |
| 上传平面图 AI 自动变 3D | 识别不稳；v0.5 只做「文字描绘」，识图以后再说且必须可手改 |
| 从零训家具网格 / 房间生成模型 | 用现成 LLM + 生图 API |
| 多层、楼梯、斜墙自由角以外的 CAD | 工期和引擎改动都大 |
| 实时协作（两人同时改） | 复杂度接近另一条产品线 |
| 报价、材料清单、DXF | 装修后期能力 |
| 第一人称漫游 | 加分项，不是「能用」门槛 |
| 把 `src/` 发 npm | 内部用 fork 即可 |

---

## 4. 分阶段

建议按周推进。每周结束要能演示，而不是堆半成品。

### 第 0 周：自己当用户（不写产品功能）

- 用当前 fork 画自己家；同时用 Sweet Home 3D 画同一套当对照。
- 记一份「卡点清单」（最多 15 条）：画墙、门窗、尺寸、保存、手机操作。
- 产出：`docs/dogfood-notes.md`（验收时对照）。

这一周的结论会改第 1～2 周的优先级，但下面三项不变：**撤销、底图、JSON 交换**。部署不进本地 MVP。

### 第 1 周：编辑器不气人

目标：你自己画户型时，不会因为误操作想砸键盘。

| 项 | 做法（概要） | 验收 |
|---|---|---|
| 历史栈 | `src/` 对 `exportSerialized()` 做快照；拖拽一次只记一条，不记每一帧 | 画墙、移家具、删门、改尺寸均可撤销 |
| 自动保存 | 现有 IndexedDB 上做 debounce（约 2s）+ 未保存提示 | 刷新后还在 |
| 复制方案 | `blueprintStorage` 增加 duplicate | 列表里「复制」出「xxx 副本」 |
| 墙厚 UI | 2D 选中墙，侧栏改 thickness，触发 floorplan 重建 | 10/15/20cm 肉眼可见 |

不做：完整命令模式、协同 OT。快照够用。

### 第 2 周：对着户型图能画准

目标：朋友拿手机拍的户型图，能描出差不多的墙。

| 项 | 做法（概要） | 验收 |
|---|---|---|
| 底图图层 | 2D canvas 下垫 image，可位移、缩放、透明度 0–100% | 描墙时墙在图上 |
| 两点校准 | 点图上已知长度的两边（如 3.6m 开间），写入世界比例 | 画完的墙长度误差可接受（目测 + 标注） |
| 底图锁定 | 锁定后只动墙、不动图 | 不会误拖图 |
| 底图不进 3D | 仅 2D 辅助，不序列化大图到分享包（或可选压缩缩略图） | JSON 仍轻 |

导出 JSON 默认只带几何，不带原图。需要底图时对方自己再导入同一张图。

### 第 3 周：本机能交换方案

目标：离开这台机器也能打开同一份（文件，不是短链）。

| 项 | 做法（概要） | 验收 |
|---|---|---|
| 导出 / 导入 JSON | 下载 `.json`；拖入或文件选择器加载 `loadSerialized` | 微信传文件往返一致 |
| 复制方案 | 列表「复制」出副本（若第 1 周已做则本周只验收） | 改副本不影响原件 |
| 简单说明 | 编辑器里三步：导入户型图或选模板 → 画墙摆家具 → 导出 | 不看文档也能开始 |

不做：Vercel、KV、`/s/:id`。上线是本地跑通之后的 Web 阶段。

### 第 4 周：补家具 + 请朋友试（可选但建议）

- 按第 0 周清单补厨房 / 卫生间 / 常用柜，大约 10～20 个 GLB，继续走现有 CDN 或自建静态目录。
- 2D/3D 各导出一张 PNG，方便发微信聊天（不是工程文件）。
- 找 2 个朋友：一人有户型图、一人没有。只看他们会不会卡住，不解释功能。
- 修 P0 体验 bug，然后冻结本地 v0。AI 不挡这批评测。
- 朋友若不能装 Node，你本机开着 `pnpm dev` 一起画，或只收他们的户型图自己画；不为此提前上线。

### 第 5 周：本地 AI + Scene Skill（v0.5）

目标：本机用一句话先长出可改的 3D；生成规则写成 Skill，以后原样进 Web prompt/RAG。  
前提：第 1 周撤销、第 3 周同一套 `layoutData` 已就绪。AI 画错必须能手改。  
接口只跑在 localhost（`app/app/api/ai/*` + `.env`），不部署。

主路径是 **B（可编辑场景）**，不是 **A（只出一张美图）**。只做 A 就变成聊天出图，墙长改不了。

#### 两层分别做什么

| 层 | 用户感知 | 实现 | 结果能不能继续改 |
|---|---|---|---|
| B. 场景生成 | 「北欧风两居，客厅连厨房，主卧 1.8m 床」→ 编辑器里出现墙和家具 | LLM 输出 JSON → 校验 → `loadSerialized` | 能。走现有撤销 / 保存 / 分享 |
| A. 效果图 | 「出一张黄昏客厅效果图」 | 3D canvas 截图 + 提示词 → 生图 API | 不能改网格，只是一张图 |

B 必须先做。A 可以同周稍后做，失败不影响 B。

#### 和现有序列化怎么接

引擎已经只有一套进出格式，AI **不得另起格式当运行时**：

```
用户描述 (+ 可选当前方案)
        │
        ▼
  POST /api/ai/scene          ← 先只在 localhost
        │  系统提示 = Scene Skill 正文
        │  + JSON Schema
        │  + ITEMS 白名单（src/constants.ts）
        ▼
  LLM 结构化输出
        │
        ▼
  服务端校验 + 补全
  （墙闭合、角点去重、门窗 item_type 合法、model_url 只允许目录内）
        │
        ▼
  { floorplan, items }   ← 与 Model.exportSerialized() 同构
        │
        ▼
  blueprint.model.loadSerialized(JSON.stringify(payload))
        │
        ▼
  历史栈 push 一次（整场景替换 = 一条撤销）
```

现有类型（`src/model/floorplan.ts`、`src/model/model.ts`）：

```ts
// loadSerialized / exportSerialized 的根对象
{
  floorplan: SavedFloorplan
  items: SerializedItem[]
}

SavedFloorplan {
  corners: Record<string, { x: number; y: number }>
  walls: Array<{ corner1: string; corner2: string; frontTexture?: ...; backTexture?: ... }>
  newFloorTextures?: Record<string, { url: string; scale: number }>
}

SerializedItem {
  item_name, item_type, model_url,
  xpos, ypos, zpos, rotation,
  scale_x, scale_y, scale_z,
  fixed, resizable?, description?
}
```

坐标单位与模板一致（见 `src/templates/default.json`，约厘米级平面坐标）。  
`item_type` 必须落在 `src/items/factory.ts`：`1` 地板家具、`3` / `7` 门窗类入墙、`8` 地面摆件、`9` 靠墙、`10` 转角。门窗只用目录里的 door/window，并尽量贴最近墙（沿用 `WallItem` 吸附）。

给 LLM 的中间格式可以更省 token：仓库里已有 `src/services/simplify-canvas-data.ts`（角点改下标、去掉材质）。约定：

- **发给模型**：当前方案用 `simplifyCanvasData(exportSerialized)`，外加用户原文、ITEMS 精简表（`key, name, category, type, 默认尺寸`）。
- **模型输出**：同一套简化 schema（`corners[]`、`walls[].corners`、`items[]` 用 `key` 而不是随意 URL）。
- **写回引擎**：本机 API 把简化结果 **展开** 成 `SavedFloorplan` + `SerializedItem[]`（生成 UUID、填默认墙纸、用 ITEMS 填 `model_url` / `item_type`），再交给前端 `loadSerialized`。

禁止模型直接发明 `model_url`。不在目录里的家具：降级到最接近的 key，或在回复里列出「没生成的件」，不要 404。

`SerializedItem.description` 已预留「给 AI 看的说明」，生成结果应写回（如「主卧双人床」），方便下一轮「把床换成榻榻米」时带着当前场景对话。

#### 输入 / 输出合同

**场景生成 `POST /api/ai/scene`**

输入：

```ts
{
  prompt: string                    // 用户描绘，必填
  currentLayout?: string            // 可选，exportSerialized() 原串；有则「改当前」，无则「从零生成」
  locale?: 'zh' | 'en' | 'tw'
}
```

输出：

```ts
{
  layoutData: { floorplan: SavedFloorplan; items: SerializedItem[] }
  warnings: string[]                // 如「目录没有岛台，已用餐桌代替」
  summary: string                   // 给用户看的短说明
}
```

前端：`loadSerialized` → toast `summary` / `warnings` → 历史栈一条。  
失败：HTTP 4xx/5xx + 可读错误，编辑器保持原状。

**效果图 `POST /api/ai/render`（可后置）**

输入：`{ prompt?: string; imageBase64: string; strength?: number }`  
`imageBase64` 为当前 3D view 截图（已有保存缩略图逻辑可复用）。  
输出：`{ imageUrl }` 或 `imageBase64`，弹层展示 + 下载。不写回 `layoutData`。

#### Scene Skill（知识源，本地和 Web 共用）

Skill 给 Cursor 用，也给本机 `/api/ai/scene` 当提示词读入。Web 上线时 **不要重写一份 prompt**，只换读取方式。

建议落在仓库内（随 fork 走）：

```
.cursor/skills/blueprint3d-scene/
  SKILL.md              # 何时用、单位、输出必须是简化 JSON；点名 redlines.md
  redlines.md           # S01–S16：禁止 / 必须（从 AiAgent 红线表改写成家装）
  reference.md          # SavedFloorplan / SerializedItem / simplify 对照
  examples.md           # 3～5 组正例 + 1 组反例（含踩红线的坏 JSON）
```

| 阶段 | Skill 怎么用 |
|---|---|
| 本地开发 | Cursor 读 Skill，帮你改提示词、抽检、修校验 |
| 本地工具 | Next API **整文件读入** 当 system prompt（正文短，先不要 RAG） |
| 以后 Web | 先原样塞进线上 prompt；`examples.md` + 家具说明变长后再切 RAG（按「画墙 / 门窗 / 某类家具」检索片段） |

切 RAG 的信号：Skill + 目录说明稳定超过模型上下文舒适区，或按房间类型检索明显更准。在此之前 **整文件进 prompt 更简单、更好调**。

Skill 只写规则和例子，不写 API key，不写「如何攻击生成接口」。

#### 从 AiAgent 借来的防幻觉与红线

对照同 workspace `AiAgent`（主要是 `design/代码生成稳定性重构架构设计 v4.0.md`、F2C `nextjs_rules.md` 红线表、`code_write_guardrails`）。  
**借原则，不搬 NestJS / regex / ts-morph。** 那些是代码生成管线的手段；这里的「落盘」是 `loadSerialized`。

能直接用的四句（AiAgent v4 §0 + Memory 节）：

1. **剥夺 LLM 对 SSOT 的改写权** — 家具 key、`item_type`、默认墙纸、单位由代码和目录独占，模型只能填简化 JSON。
2. **错误在产生点消灭** — 校验失败不准进编辑器，和 AiAgent「tsc-clean 才落盘」同一逻辑。
3. **契约与经验分层** — Skill / schema 是契约；以后 RAG 只加可检索的教训，**禁止用 Memory 替代目录或类型**。
4. **宁缺毋滥** — 无脑灌 RAG 会「防御性幻觉」（乱加墙、乱补家具）。无合格命中就不注入。

磁盘 + Prompt 双通道（AiAgent v3.5 教训）：规则只写在代码里、不写进 Skill，模型会绕过；只写在 Skill 里、代码不校验，幻觉仍会进场景。**两边同一套 Sxx。**

##### 场景生成红线（S01–S16 · 进 `redlines.md` + 代码校验）

格式对齐 F2C：每条有 ID、禁止、必须。`tier: redline` 的失败 = 拒绝上屏，不是 warning。

| ID | 规则 | 禁止 | 必须 |
|---|---|---|---|
| S01 | 目录是家具 SSOT | 编造 `model_url`、目录外 `key`、假尺寸品牌名当模型 | `items[].key` ∈ `src/constants.ts` ITEMS |
| S02 | 类型是引擎 SSOT | 自造 `item_type`（如 99） | 只用 factory 已有：1 / 3 / 7 / 8 / 9 / 10；门窗只用 door/window 类 |
| S03 | 只出简化 schema | 输出 Three 对象、完整 `SavedFloorplan` UUID 墙纸、Markdown 闲聊 | 只出 `simplify-canvas-data` 那套 JSON |
| S04 | 墙引用合法角点 | 墙指向不存在的下标；孤立点 | 每面墙两个 corner index 都在 `corners[]` 内 |
| S05 | 房间要能围合 | 开口墙当「房间」却不声明开口 | 声称某房间则边界墙闭合，或 `warnings` 写明未闭合 |
| S06 | 单位与模板一致 | 混用米/厘米/Three 世界单位 | 与 `src/templates/default.json` 同一套平面坐标（约厘米） |
| S07 | 改当前 ≠ 清空重做 | 用户只说「换沙发」却丢掉未提及的墙和房间 | 有 `currentLayout` 时只改被点名的部分 |
| S08 | 材质不开放发明 | 任意外链贴图 | 墙/地板纹理只用内置或已允许的 URL 表；默认填模板墙纸 |
| S09 | 尺寸别装精准 | 宣称符合规范、可施工、误差厘米级 | `summary` 写「示意，须手改」；不写建筑合规结论 |
| S10 | 效果图不写回场景 | `/api/ai/render` 改 `layoutData` | 效果图只出图 |
| S11 | 落盘门禁 | 校验失败仍 `loadSerialized` | 等价 AiAgent write guardrails：非法 JSON 保持原场景 |
| S12 | 契约不靠 RAG | 用检索结果覆盖 ITEMS / item_type / 单位 | RAG 只可附「教训」短句；冲突时以代码 + Skill 为准 |
| S13 | RAG 宁缺毋滥 | 无匹配也硬塞 5 段「相关户型」 | 先不做 RAG；以后 Top-K≤2、超距离丢弃、空则省略 |
| S14 | 未知家具要坦白 | 静默丢件或换成不相干模型还不说 | `warnings` 列出「要了岛台 → 用餐桌代替 / 未生成」 |
| S15 | Skill 无密钥无攻击面 | Skill 里写 API key、越狱示例、如何绕过校验 | 只写合法生成规则 |
| S16 | 用户意图优先于补全 | 为了「看起来满」自动加未要求的整屋家具 | 只生成用户提到的房间/件；缺省用空白房间而不是臆造全屋 |

代码校验至少覆盖 **S01 S02 S04 S05 S06 S08 S11 S14**。其余以 Skill 约束为主，抽检时人工看。

##### 不从 AiAgent 搬过来的

| AiAgent 做法 | 这里为什么不搬 |
|---|---|
| 禁止 regex 改 TS AST | 我们不让 LLM 写引擎源码 |
| ts-morph / 模板写 infra | 壳是现成 Next + Blueprint3d |
| Chroma 跨 Step 互学 | 本地 v0.5 无多 Step；Web 以后才考虑教训库 |
| 整文件 denylist（main.ts / prisma） | denylist 改成：禁止发明 URL / type / 清空未提及房间 |

#### 第 5 周任务

| 项 | 做法（概要） | 验收 |
|---|---|---|
| 写 Scene Skill | `SKILL.md` + `redlines.md` + `reference.md` + `examples.md` | Cursor 按 Skill 能产出可 `loadSerialized` 的 JSON；反例故意踩 S01/S04 应被拒 |
| 本机读 Skill | `/api/ai/scene` 读入含 `redlines.md` | 改红线刷新后规则跟着变 |
| 对话入口 | 侧栏「用白话生成」；空场景 / 已有方案 | localhost 能用；密钥在 `.env` |
| 落盘门禁 | `simplify` 逆变换 + S01/S02/S04–S06/S08/S11/S14 | 非法 JSON 不进引擎，编辑器保持原状 |
| 接入编辑器 | 整场景替换并入撤销栈 | Ctrl+Z 回到生成前 |
| 效果图 | 截图 + 生图 API（可后置） | 出一张图；失败不影响场景 |

模型：本机先固定一家（Claude / GPT / Gemini）+ structured output。不要第 5 周做模型路由或 RAG。  
生图：Flux / Imagen 等，不训 LoRA。

第 3 周说明仍写「导入户型图或选模板」。第 5 周本机再加「或用一句话生成」。

### Web 阶段（本地 v0 + v0.5 之后，不排进前五周）

本地自己用顺、JSON 交换没问题后再做：

1. `app/` 部署到 Vercel，默认中文。
2. 匿名短链 `/s/:id`（KV），打开后同样 `loadSerialized`。
3. 线上 `/api/ai/scene`：先把 **同一份 Skill + redlines** 打进 system prompt。
4. 再切 RAG 时遵守 S12/S13：只检索教训，不检索「可以发明的家具」；Top-K≤2，空则不注入。
5. 限额、密钥、CORS 按公网补，本地 `.env` 流程保持能跑。

---

## 5. 技术切分（实现时按此改，避免和上游缠死）

```
src/                         引擎：历史栈、墙厚、底图坐标、load/exportSerialized
src/services/simplify-canvas-data.ts
                             LLM 中间格式；需补「简化 → 完整」逆变换
app/services/storage.ts      本地方案 + 复制 + 自动保存
.cursor/skills/blueprint3d-scene/
                             生成规则（Cursor + 本机 API + 以后 Web prompt/RAG）
app/app/api/ai/scene         localhost：读 Skill → LLM → 校验后的 layoutData
app/app/api/ai/render        localhost：截图 → 效果图
app/components               底图、墙属性、导入导出、AI 对话
```

Web 以后才加：`/s/[id]`、KV、线上同一套 API。

原则：

- 能进 `src/` 的状态机不要写在 React 里（撤销、校准、序列化）。
- IndexedDB、JSON 文件、AI 写回 **共用** `{ floorplan, items }`，不要三套格式。
- LLM 只看见 Skill + 红线 + 简化 schema + 家具白名单。
- Skill / `redlines.md` 与代码校验是同一套 SSOT，改一处必须对齐另一处。
- 上游当参考，功能做在本 fork。
- 本地密钥只在 `.env`。Skill 不当作用户点击的运行时。
- 先整文件进 prompt，再考虑 RAG；RAG 宁缺毋滥，不能覆盖 S01–S08。

---

## 6. 风险

| 风险 | 应对 |
|---|---|
| 户型图拍照透视、比例不准 | 两点校准 + 允许微调墙长；不承诺毫米级 |
| 快照太大导致撤销卡 | 只存序列化 JSON；限制栈深 50；拖拽结束才 push |
| 朋友打不开 localhost | 用 JSON 交换，或你代为导入；不因此提前上线 |
| 家具 CDN 挂了 | 本地可先继续用现有 CDN；Web 上线前再考虑镜像 |
| 手机画墙很难 | v0 以电脑为主，手机能看、能微调；完整触摸手势放 v0 之后 |
| 范围膨胀 | 朋友反馈先记下来，不进当前迭代 |
| AI 墙不闭合 / 门窗悬空 | 校验失败则重试一次或拒绝上屏；成功也进撤销栈，鼓励手改 |
| 模型幻觉出目录外家具 | 白名单 key；未知 key 映射或丢弃并写入 `warnings` |
| 提示词 / 坐标单位搞错 | 系统提示写明单位与模板示例；抽检用自家户型描述 |
| 效果图和场景对不上 | 文案写清「效果图仅供参考」；A 不覆盖 B |
| API 费用被刷 | 本地先不公网暴露；上线后再做每 IP 限额 |
| Skill 与代码两套规则 | 红线 ID 两边同号；校验以代码为准，Skill 不得写代码做不到的「必须」 |
| 过早上 RAG / 防御性幻觉 | 整文件还能进上下文就不要切；切了 Top-K≤2，空命中不注入（AiAgent Memory 节） |

---

## 7. 怎么验收（你自己走一遍）

1. 本机 `pnpm dev` 打开，不登录、不部署。
2. 导入自家户型图，校准一个已知开间，描完客厅 + 一间卧室。
3. 放床、沙发、一门一窗，改一次尺寸，撤销两次再重做。
4. 刷新页面，方案还在。
5. 导出 JSON，换无痕窗口导入，内容一致。
6. 把 JSON 拷到另一台机器或发给自己微信，导入后仍是同一份。

以上 1～6 是 **本地 v0 过关**。第 5 周另验：

7. 空场景输入「两居，客厅约 20 平北欧风，主卧放 1.8 米床」，墙和家具出现，可拖、可撤销回生成前。
8. 再输入「把沙发换成三人位」，是改当前方案而不是整屋清空。
9. 改 `redlines.md` 或 `SKILL.md` 一条规则（例如禁止某 key），刷新后再生成，行为跟着变；故意要目录外家具时走 S14，不静默 404。
10. （可选）出效果图；关掉图后 3D 场景仍在。
11. AI 生成结果导出的 JSON 与手动画的方案能互相导入。

---

## 8. 和「以后做产品」的关系

先本地工具，是为了先验证「画不画得完、AI 规则稳不稳」，而不是先搭分发。  
v0.5 的 Skill 是以后 Web prompt/RAG 的同一份稿，避免上线时重写提示词。

本地自己用顺之后，Web 按这个顺序加：

1. 部署编辑器（还是 IndexedDB + JSON）
2. 短链（KV）
3. 线上 AI：Skill **整文件进 prompt**
4. Skill 变长后再 RAG
5. 登录、识图、网格生成 —— 更后

现在把登录、短链或 RAG 做进去，会拖慢「本机先能用」。

---

## 9. 建议决策（请先拍板）

按这次拍板，默认如下（有异议再说）：

1. **先本地工具**：v0 / v0.5 都只跑 localhost，不上线、不做短链。
2. **交换用 JSON 文件**。
3. **第 0 周先画自己家**，再写编辑器缺口。
4. **Skill 当知识源**：第 5 周写成 `.cursor/skills/blueprint3d-scene/`，本机 API 整文件当 prompt；Web 以后先同样灌 prompt，太长再 RAG。
5. **AI 不挡本地 v0**。第 5 周先做场景 JSON（B），效果图能切再切。
6. **第 5 周模型** 开工前再定一家 LLM（Claude / GPT / Gemini）。
