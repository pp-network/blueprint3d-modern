# Sweet Home 3D 7.7-Online 对照设计

对照对象：SourceForge 分支 [`develop-SweetHome3D-7.7-Online`](https://svn.code.sf.net/p/sweethome3d/code/branches/develop-SweetHome3D-7.7-Online/)（r9047，2025-04-02）。  
本地副本：`tmp/sweethome3d-7.7-online/`（已在 `.gitignore`）。  
我们的产品：Blueprint3D Modern（MIT，TypeScript + Three.js + Next.js），目标见 `docs/web-mvp-plan.md`。

本文只记**行为与模型差异**，作为导入优先级。禁止复制 SH3D 源码（GPL-2.0）。

---

## 0. 源码怎么放的

本机自带 SVN 1.7 过旧，HTTPS 握手失败。已用 Homebrew `subversion 1.14.5` 稀疏检出：

| 路径 | 内容 | 体积 |
|---|---|---|
| `tmp/sweethome3d-7.7-online/SweetHome3D/src` | Java 桌面：model / viewcontroller / swing / j3d | ~31 MB，247 个 `.java` |
| `tmp/sweethome3d-7.7-online/SweetHome3DJS/src` | HTML5 编辑器手写 JS + JSweet 配套 | ~2.2 MB |
| 未拉 | `lib/` 原生 JOGL/YafaRay、`install/`、家具库二进制 | — |

更新：

```bash
cd tmp/sweethome3d-7.7-online
svn update
svn update --set-depth infinity SweetHome3D/src SweetHome3DJS/src
```

README 仍写 7.5 / JS 7.5.2；`build.xml` 与 `SweetHome3DJSApplication.getVersion` 报 **7.7 Online**。桌面模型 + 浏览器编辑器（`IncrementalHomeRecorder` 把 undoable edit 打到 JSP/PHP）。JS 的照片 / 视频 / 打印是空壳（`JSViewFactory` dummy），不要当「Web 已有渲染器」。

许可：SH3D 是 **GPL-2.0**，我们是 **MIT**。可以对照交互和数据结构，不能搬 Java/JS 实现。

---

## 1. 两边模型差在哪

这是后面所有「该不该导入」的前提。两边都是「2D 平面 + 3D 预览」，但拓扑完全不同。

```
Sweet Home 3D                         Blueprint3D Modern
─────────────────                     ─────────────────
Wall: (xStart,yStart)→(xEnd,yEnd)     Corner 共享顶点
      + wallAtStart / wallAtEnd       Wall 只连两个 Corner
      弧墙 arcExtent                  只有直线
Room: 用户点出来的独立多边形            墙闭合后自动找环
Door: 家具 + SVG cutOut 挖墙网格       把墙拆成 opening 段
Level: 多层 elevation                 单层
Undo: Swing UndoableEdit 命令         HistoryStack 整场景快照
底图: 进 Home / 每层一份              overlay，不进 exportSerialized
```

### 1.1 墙

SH3D `Wall`（`SweetHome3D/.../model/Wall.java`）是**独立线段**：

- 两端坐标自管，不共享顶点。
- `wallAtStart` / `wallAtEnd` 显式接到邻墙；T 接、共线延长要走 `PlanController.joinSelectedWalls()`。
- **T 接默认不自动打断**：墙从中段穿过不会拆成两段，用户要自己 `splitSelectedWall`。我们已有 `corner.mergeWithIntersected()`，交叉会拆墙——比 SH3D 更利于围房间，画的时候吸附仍然弱。
- 每墙：厚度、高度、`heightAtEnd`（坡顶）、`arcExtent`（弧墙）。
- 左右皮独立：颜色、贴图、光泽、踢脚线 `Baseboard`。

我们：`Corner` + `Wall`（`src/model/corner.ts`、`wall.ts`）。角点重合会并（`overlappedCorner`）。房间、开门、AI 补线都靠这张图。画墙时只做轴对齐吸附（`snapTolerance = 25` cm）。

**结论：保留我们的角点图。** AI 认墙、门洞连通、房间自动围合都依赖共享顶点。导入的是 SH3D 的**吸附 / 接墙手感**，不是 `wallAtStart` 模型。

### 1.2 房间

SH3D `Room` 是**独立多边形**（`points[]`），带名字、面积标注、地板/天花可见性。三种来源：手点多边形；双击闭合墙区（`getRoomPathsFromWalls` 用墙外形 Area 抽内环，`computeRoomPointsAt` 再把门阶补进边界）；从房间反推墙。墙改了，房间**不会**自动跟着变。

我们：`Floorplan` 更新时从半边找闭合环（`src/model/room.ts`）。墙不闭合房间就没了。已有 `roomLabels`、面积、地板贴图。

**结论：自动围合更适合户型图 / AI。** 要补的是：墙暂时不闭合时房间名和面积别丢；用户能改房间名、钉住面积标注。

### 1.3 门窗

SH3D：`HomeDoorOrWindow` 是家具。`cutOutShape`（单位正方形上的 SVG path）挖墙网格；`boundToWall`、`sashes`、`wallCutOutOnBothSides`。墙仍是一条，拓扑不断。

我们：`insertOpeningOnWall`（`src/model/opening-wall.ts`）把墙拆成「实墙 + opening + 实墙」。`opening` 墙 2D/3D 隐藏，只为围房间。另有 `door-gaps`、`door-access`（房间必须有门、门要连通）。

拆墙的代价：撤销、拖门、AI 再认墙都容易把拓扑弄脏。SH3D 挖网格更稳，但实现重，也没有我们这套「房间可达」判断。

**结论：中期改成混合。** 拓扑继续用 `opening`（或墙上的洞区间），不要为了开门把墙切成三段。3D 挖洞学 SH3D 的 cut-out，不要再拆 Corner。

### 1.4 撤销与在线保存

| | SH3D | 我们 |
|---|---|---|
| 撤销 | 每步一个 `UndoableEdit`（接墙、锁底图、翻转……） | `exportSerialized()` 快照，手势结束记一条 |
| 在线 | `IncrementalHomeRecorder.js`：把 edit 打到 `writeHomeEditsURL`，10s ping | IndexedDB + debounce 自动保存 |
| 崩溃恢复 | `AutoRecoveryManager`：独立 Recovery 库 + 打开时确认；增量模式**没有**恢复 | `local-autosave-draft` |

`docs/web-mvp-plan.md` 已定：快照够用，不上完整命令模式。SH3D 在线增量依赖 JSP/PHP，不要搬。

---

## 2. 能力对照

| 能力 | SH3D / JS | 我们 | 建议 |
|---|---|---|---|
| 画墙 + 轴对齐 | 有，另有角度/长度磁性 | 有，仅轴对齐 25 cm | **导入磁性** |
| 接墙 / T 接 / 共线 | 手动 `join` / `split`，中段穿过不拆 | 角点合并 + `mergeWithIntersected` 会拆墙 | 画时吸附仍弱；T 接我们已自动拆 |
| 弧墙 / 坡顶 | `arcExtent` / `heightAtEnd` | 无 | 以后再说 |
| 逐墙厚度 / 高度 | 属性面板 | **厚度有 UI**（`WallThicknessPanel`）；高度锁 250 cm，无界面 | 补墙高 UI |
| 踢脚线 | `Baseboard` | 无 | 不做 |
| 房间自动围合 | 双击闭合区才生成，之后不随墙更新 | 墙一闭自动出房间 | **保持我们的** |
| 房间名 / 面积可拖 | 有 | 有 `roomLabels`，**不能手改名** | 导入改名 + 面积 |
| 墙/地贴图 | 点哪改哪 | 点开选择器后改**全部**墙或全部房间 | **对照改：按选中面** |
| 底图两点定尺 + 原点 | 向导：选图 → 比例 → 原点 | overlay + 两点校准 | 我们已有；可学向导分步 |
| 底图进存档 | 进 Home，每层一份 | 不进 JSON | 保持轻量；可选缩略图 |
| 门窗挖墙 | 家具 cut-out | 拆 opening 墙 | **对照改拓扑** |
| 门连通判断 | 无 | `judgeDoorAccess` | **保持我们的** |
| 用户尺寸线 | 持久 `DimensionLine` + **编辑时临时尺寸** | 只有墙上自动长度 | **先导入临时反馈** |
| 指南针 / 北 | `Compass` + 日照 | 无 | P2 |
| 多层 | `Level` | 明确不做 | 不做 |
| 多选 / 复制 / 翻转 | 有 | 方案列表可复制，图内不能 | **导入** |
| 家具编组 / 离地 | `HomeFurnitureGroup` | 单件缩放旋转 | P1 |
| 灯光家具 | `HomeLight` | 普通件 | 不做 |
| 第一人称 / 存视角 | `ObserverCamera` + stored cameras | 轨道相机 | MVP 不做 |
| 照片级渲染 | YafaRay / Sunflow | 无；计划里是截图生图 | **不要导入渲染器** |
| 打印 / PDF / OBJ | 有 | 无 | P2 |
| AI 认墙 / OCR 比例 | 无 | 有 | **我们领先** |
| 户型图墨迹约束 | 无 | `constrain-ink` 等 | **我们领先** |
| JSON 进出 | `.sh3d` | **能导入** `{floorplan,items}` / draw.io；**导出只有 draw.io** | 补原生 JSON 导出（计划第 3 周） |
| 2D 触摸 | 长按菜单 | 2D 只有鼠标；3D 有触摸 | 后置；v0 以电脑为主 |
| draw.io 导出 | 无 | `floorplan-drawio` | **我们领先**（但不要当 JSON 交换） |
| 目录 | 巨大 OBJ/SH3F | 精简 GLB（厨房卫浴仍薄） | 保持 GLB，按需补件 |

---

## 3. 值得导入的功能

按「画自家户型时立刻会骂」排序，并对齐 `docs/web-mvp-plan.md` 的不做项。

### P0 — 编辑器不气人（建议插进第 1～2 周体验）

**1. 磁性吸附 + 对齐辅助线**

SH3D 画墙时（`PlanController.WallDrawingState` / `LengthUnit` / `PlanComponent`）：

- 接到附近**空闲**墙端（已接上的端不再抢）。
- 角度：`PointWithAngleMagnetism`，按 15° 倍数吸。
- 长度：`getMagnetizedMeterLength`，精度随缩放在约 1 mm～10 cm 之间变。
- 对齐辅助线：距最近平行墙 / 物件约 25 cm 的虚线。
- **修饰键**：磁性开关是 Win Alt / Mac Cmd / Linux Alt+Shift；**Shift 是强制水平/垂直/15°**，不是关磁性。描底图必须能关磁性。

我们只有「靠近就拉成水平/垂直」。斜墙、接 T 字、对准底图墙角都会飘。

落地：在 `src/floorplanner/floorplanner.ts` 的 `targetX/Y` 上加 15° + 近端点 + 随缩放的长度吸附，并画对齐虚线。不要改成 SH3D 的独立端点墙。厚墙转角的斜接只做渲染（`Wall.getShapePoints` 外形求交），模型仍用共享 Corner。

**2. 图内多选 + 平移 + 方向键微移**

SH3D `PlanComponent`：框选、Delete、方向键（含加速）。我们一次只能抓一个角/一堵墙/一件家具。

落地：2D 选择集（角、墙、家具）；拖一次记一条撤销。3D 可后做。

**3. 图内复制 / 粘贴 / 原位再来一件**

SH3D 对墙、房间多边形、家具都能复制；粘到自己身上会偏 20 cm，避免完全重叠。我们只有方案列表「复制」。描完客厅再摆第二间卧室时，复制比重画快。

**4. 编辑时临时尺寸，再做持久尺寸线**

SH3D 两层：拖墙 / 拖家具 / 改房间角时出现临时尺寸（距墙端、边长、对角线）；另有用户画的 `DimensionLine`（可进 3D、可标高度）。我们只有墙中段自动字。

落地顺序：先做临时反馈（不进 JSON），再加 `SavedFloorplan.dimensionLines?: { x1,y1,x2,y2,offset }[]`。不要一上来做 3D 高度尺寸。

**5. 门窗不要再拆墙**

对照改不足，见 §4.1。这是模型债，越晚越贵。

### P1 — 摆家具和看图（第 4 周前后）

**6. 家具离地 + 编组**

SH3D：`elevation`、`HomeFurnitureGroup`（整组当一件搬、缩放）。我们 `SerializedItem` 已有 `ypos`，UI 几乎当平面件。吊柜、挂画、餐桌椅一组都需要。

**7. 可拖的房间名 / 面积**

SH3D 房间名和面积是一等对象。我们有 `roomLabels` 和 AI 房间名，2D 里不好改、不好钉。

**8. 底图向导三步**

SH3D：`BackgroundImageWizardController.Step = CHOICE | SCALE | ORIGIN`。我们功能齐（导入、透明度、锁定、两点校准），交互是工具散落。可收成同一条向导，不必改数据。

**9. 家具目录检索 + 按房间过滤**

SH3D 目录可搜。我们分类浏览，厨房/卫生间件少（计划里已写补 10～20 件）。先检索，再补件。

**10. 选择翻转（镜像）**

SH3D `FlippingUndoableEdit`。户型左右相反的复印件很常见。实现：对选择集做轴镜像，门窗朝向跟着翻。

**11. 崩溃恢复和关页提示（学模式，不学协议）**

JS 版：`AutoRecoveryManager` 把恢复稿和正式稿分库存；打开时确认「是否恢复」；`beforeunload` 拦未保存。增量协同模式故意不做恢复。我们已有 `local-autosave-draft`，缺的是：和「我的方案」分开、刷新/重开时明确问一句、关标签前提示。视口缩放也可写进草稿（SH3D 的 `PLAN_VIEWPORT_*` / `SCALE_VISUAL_PROPERTY`）。

### P2 — 明确后置

| 项 | 为什么后置 |
|---|---|
| 指南针 / 北 / 日照 | 效果图和「朝南客厅」有用；不挡手画 |
| 第一人称 + 存视角 | MVP 计划定为加分项 |
| 多层 + 楼梯 | 计划明确不做；引擎要长 `Level` |
| 弧墙 / 坡顶 / 踢脚线 | 中国住宅户型图几乎都是正交直墙 |
| 照片渲染 / 漫游视频 | 用「3D 截图 → 生图 API」，不要 YafaRay |
| 打印 PDF / 导出 OBJ | 先 PNG + JSON |
| 在线增量协同 | 另一条产品线 |
| 灯光家具 / 材质编辑器 | 目录和贴图够用再加 |

---

## 4. 值得对照修改的不足

分两类：我们的体验债（对着 SH3D 会立刻暴露），以及 SH3D 本身不要学的设计。

### 4.1 我们该改的

**A. 开门拆墙（最高优先的模型债）**

`insertOpeningOnWall` 删原墙、加两个角、插 `opening`。后果：

- 拖门等于改拓扑，撤销快照很大。
- AI 再认墙会和已拆的洞打架。
- 墙厚、贴图要在三段上分别记。

SH3D 墙不断，洞是家具属性。我们已有 `Wall.opening` 和 `door-access`，不必学它的 SVG path。

建议：

1. 墙保持一条，用 `openings: { along, width }[]`（或沿用 opening 标记但不拆角）。
2. 2D 留门缝，3D 按门宽挖网格。
3. `judgeDoorAccess` 继续读洞，不读「被删掉的墙」。

**B. 吸附太弱**

只有轴对齐。斜墙、接已有墙端、对准底图墙角都要手瞄。SH3D 是三层：空闲端点、15°、随缩放的长度量化，外加对齐虚线；修饰键能关。描扫描件时 90° 磁性会把真斜墙拉直，必须能关。

**C. 一次只能改一件**

框选一排柜子、一起挪沙发和茶几，SH3D 用户会当基础能力。没有多选，复制、翻转、批量删都做不了。

**D. 尺寸只有墙上自动字**

自动长度在画的时候有用，验收「开间 3.6 m」不够。SH3D 先有**拖动时的临时尺寸**（距墙端、边长），再有用户尺寸线。我们两层都缺。

**E. 底图不进交换包**

`overlay.ts` 写明不进 `exportSerialized()`。JSON 轻是对的（计划也这么定）。缺口是：换浏览器要重新导入同一张图、重新校准。可选用：只存 `detectTransform` + 图的 hash；或可选压缩缩略图。不要默认把原图打进 JSON。

**F. 房间完全派生、一断就没**

自动围合是优点。墙差一点没闭合，房间名、地板贴图、面积一起消失。SH3D 房间是独立多边形，墙断了名字还在。折中：闭合环仍自动算；`roomLabels` 按中心点钉住，环暂时没了也不删。

**G. 家具没有「组」和「离地」**

厨房一排柜、吊柜、挂墙电视，在 SH3D 里是常规操作。我们的 `item_type` 9/10 只解决靠墙/转角，不能一组搬、不能标离地。

**H. 撤销是整包 JSON**

计划已接受快照。对照 SH3D 之后只要守住：拖的过程不入栈、叠深 50、AI 整场景替换算一条。不要为了学 SH3D 上命令模式。

**I. 贴图点一下改全家**

`handleTextureSelect` 遍历全部墙或全部房间。SH3D 用户会以为点了哪面墙就改哪面。应按选中墙 / 选中房间写 `frontTexture` / `setTexture`。

**J. 交换格式不对称**

能导入 JSON，导出按钮却写出 `.drawio`。朋友按计划用 JSON 往返会对不上。导出要同时提供 `exportSerialized()` 的 `.json`。

**K. 墙高锁死、房间不能手改名**

厚度已有面板。高度仍是全局 250 cm。房间名只有 AI/`房间 N`，2D 里改不了。

### 4.2 SH3D 的不足（不要学）

**1. 墙不共享顶点**  
接墙、T 接是特殊命令，共线还要算交点。我们的角点图对 AI 补线和房间更干净。

**2. 房间要点出来**  
对「从户型图长出房子」是倒退。CAD 认墙之后房间应该自己出现。

**3. 没有识图**  
底图只是描摹层。我们的认墙、OCR 比例、墨迹约束、门洞 findings 是差异化，不要为了「更像 SH3D」收掉。

**4. JS 线是 Java 转出来的**  
`SweetHome3DJS` 用 JSweet 把 model/controller 编成 JS，手写的是 `PlanComponent.js`、`HomeComponent3D.js`、Recorder。栈是 Java 5 风格 + 浏览器补丁，不适合当我们的运行时。

**5. 在线保存绑 JSP/PHP**  
`IncrementalHomeRecorder` 假定 `readHome.jsp` / `writeHomeEdits.jsp`。我们继续 IndexedDB + JSON 文件。

**6. 家具是 OBJ/SH3F 宇宙**  
我们已走 GLB。不要导入他们的目录格式或家具库编辑器。

**7. 磁性默认太强会打架**  
描扫描件/CAD 底图时，15°/90° 磁性会把真斜墙拉直。必须能关（SH3D：Win Alt / Mac Cmd；不要误用 Shift，Shift 是强制对齐）。

**8. 照片渲染器太重**  
YafaRay/Sunflow 是桌面路径。Web 继续「截图 + 生图」。

---

## 5. 明确不要导入

- 任何 GPL 源码、资源、图标、properties 文案。
- Java / Java3D / JOGL / JSweet / Ant 构建。
- 多层、楼梯、斜墙自由曲面（计划已排除）。
- 协同 OT、增量 edit 协议。
- 报价、材料清单、DXF（计划已排除）。
- 内置路径追踪、视频漫游。
- 把 `.sh3d` 当运行时格式（若以后要互操作，做单向导入，不反向绑死）。

---

## 6. 建议落地顺序

和 `docs/web-mvp-plan.md` 对齐，不另开产品线。

| 阶段 | 做 | 来自 SH3D 的 | 刻意不做 |
|---|---|---|---|
| 第 1 周（编辑器不气人） | 撤销已有；补**磁性+对齐线**、**多选+方向键**、**拖动时临时尺寸** | 吸附 / 选择 / 临时标注 | 命令模式撤销 |
| 第 2 周（对着图能画准） | 底图已有；补**持久尺寸线**、恢复稿确认、关页提示；向导可收束 | 尺寸线、底图向导、Recovery | 底图默认进 JSON |
| 穿插，越早越好 | **门洞改成不拆墙** | cut-out 思路 | SVG path 语法 |
| 第 4 周（补家具） | 检索、离地、编组、翻转 | 编组 / 镜像 | 灯光、踢脚线 |
| v0.5 AI | 保持认墙 / OCR / Skill | — | 用 SH3D 格式当 LLM 输出 |
| 更后 | 指南针、第一人称、PNG 导出 | 观察者相机 | 多层、照片渲染器 |

验收时用同一套户型各画一遍（`docs/dogfood-notes.md` 已写对照工具 = 当前 fork / Sweet Home 3D）。能写进卡点清单的，优先就是上表 P0。

`docs/web-mvp-plan.md` §2 和 README Roadmap 落后于代码：撤销、底图、自动保存、墙厚、方案复制已经有了。对照时以本文和 `src/` 为准。

---

## 7. 关键源码索引

本地只读，改功能写我们自己的 `src/`。

| 主题 | SH3D | 我们 |
|---|---|---|
| 墙 | `SweetHome3D/.../model/Wall.java` | `src/model/wall.ts` `corner.ts` |
| 房间 | `model/Room.java`；`PlanController.computeRoomPointsAt` | `src/model/room.ts` `floorplan.ts` |
| 门窗 | `model/DoorOrWindow.java` `HomeDoorOrWindow.java` | `src/model/opening-wall.ts` `door-access.ts` |
| 底图 | `model/BackgroundImage.java`；`BackgroundImageWizardController.java` | `src/floorplanner/overlay.ts` |
| 尺寸 | `model/DimensionLine.java` | `src/core/dimensioning.ts`（仅单位换算） |
| 画墙状态机 | `PlanController.WallDrawingState`（约 10564 行） | `src/floorplanner/floorplanner.ts` |
| 磁性数学 | `LengthUnit.getMagnetizedMeterLength`；`PointWithAngleMagnetism` | 仅 `snapTolerance = 25` |
| 接墙 | `PlanController.joinSelectedWalls` / `splitSelectedWall` | `Floorplan.overlappedCorner` |
| 多层 | `model/Level.java` | — |
| 指南针 | `model/Compass.java` | — |
| 撤销 | `viewcontroller/LocalizedUndoableEdit.java` | `src/core/history.ts` |
| 在线保存 | `SweetHome3DJS/src/IncrementalHomeRecorder.js` | `app/services/storage.ts` |
| 3D 观察者 | `model/ObserverCamera.java` | `src/three/controls.ts` |
| 2D 画布 | `SweetHome3DJS/src/PlanComponent.js` | `src/floorplanner/floorplanner_view.ts` |
