# 户型图 AI 开源对照

对照对象：五个「平面图 → 分割 / 矢量 / BIM / 扫描」开源项目。  
本地副本在 `tmp/`（已 gitignore）。  
我们的现状：文档视觉模型认墙（`outerLoop` + `innerWalls`）+ 墨迹约束 + OCR 比例 + 门洞 findings，结果进 `applyWallTraceToModel`。不训分割网，不把 IFC/DWG 当运行时。

本文只记**算法与流程**，不搬训练栈、权重、Colab 硬编码路径。和 `docs/design/sweethome3d-7.7-online.md` 互补：那边是编辑器，这边是识图。

---

## 0. 下到哪、是不是原仓库

| 用户说法 | 实际仓库 | 本地 | 许可 | 完整度 |
|---|---|---|---|---|
| Mr-Daker/Floor-Plan | [Mr-Daker/Floor-Plan](https://github.com/Mr-Daker/Floor-Plan) | `tmp/Floor-Plan/` | **无 LICENSE** | 几何后处理 + IFC 导出齐全；权重不在 git；README 写的 `frontend/` 没检出 |
| newva/dwg-bim_AI | [newva/dwg-bim_AI](https://github.com/newva/dwg-bim_AI) | `tmp/dwg-bim_AI/` | MIT（版权写 KanishkDevCode） | **几乎没源码**：两个 `.pt` + README。README 标题还写着 Structify_AI |
| Structify-AI | [KanishkDevCode/Structify-AI](https://github.com/KanishkDevCode/Structify-AI) | `tmp/Structify-AI/` | MIT | 一份 Colab 风格 `Sturtify_AI (Backend).py`；`Trained_Models/*.pt` 各 **2 字节空壳**；前端另库 `neon-architect-glow` |
| Arc | [babasveeramallu/arc-image-identifier](https://github.com/babasveeramallu/arc-image-identifier) | `tmp/Arc/` | 无 LICENSE | Hackathon 摄像头扫描，不是户型图识图 |
| aliasstudio/mitunet | [aliasstudio/mitunet](https://github.com/aliasstudio/mitunet) | `tmp/mitunet/` | 代码 MIT；**权重 CC-BY-NC 4.0** | 论文 + notebook；`.pth` 是 **Git LFS 指针**（本机未拉）；`datasets/regional/` 有 500 张 CIS 户型 |

`newva/dwg-bim_AI` 的 `Models/*.pt`（各约 6.8 MB）和 Structify Colab 里 `YOLO("/content/drive/MyDrive/Trained_Model/...")` 是同一条线：能跑的权重在前者，推理脚本在后者。Structify 自己的 `Trained_Models/` 是空文件。不要当两个独立系统。

更新：

```bash
cd tmp/Floor-Plan && git pull
cd ../dwg-bim_AI && git pull
cd ../Structify-AI && git pull
cd ../Arc && git pull
cd ../mitunet && git pull
```

---

## 1. 和我们管线差在哪

```
这些项目                              我们
────────                              ────
像素分割（SegFormer / YOLO / U-Net）   文档视觉 LLM → JSON 折线
轮廓 / 骨架 → 多边形                   outerLoop + innerWalls 中心线
IFC / DWG / GeoJSON / GLB 挤出         SavedFloorplan + GLB 目录件
西方 CubiCasa / Roboflow 标注          中国 CAD / 户型图 + OCR 总宽
要 GPU 训 / 推                         本机 API 调云端视觉模型
```

他们强在**像素级墙皮**和**后处理规则**。我们强在**中心线拓扑**、中文尺寸、门连通、可手改。对上的借鉴点几乎全在后处理，不在换骨干网。

---

## 2. 分项目

### 2.1 Floor-Plan（最值得读后处理）

**声称：** SegFormer / Mask2Former → 语义掩码 → 矢量 → IFC + 本地 Web 预览。  
**实际：** `src/geometry/postprocess.py` + `vectorize.py` 是干货（墙是**填色多边形**，没有中心线）。11 类西方房间名。git 里没有权重、没有 README 写的 `frontend/` / `webapp.py`。`infer.py` / `train.py` 对不上 5090 训练脚本里的 tiled / cutmix 参数。IFC 比例写死 `1 px = 1 cm`。`_regularize_thin_component` / `_regularize_opening_component` **定义了没人调用**。无 LICENSE。

值得对照的规则（都在 `tmp/Floor-Plan/src/geometry/`）：

| 规则 | 做法 | 对我们 |
|---|---|---|
| 漂浮门窗丢掉 | `remove_floating_openings`：门窗 5px 内没有墙就清掉 | **P0**。`findings.openings` 必须贴墙；已有 `OPENING_SNAP_CM`，缺「离墙太远则丢」 |
| 估计墙厚 | `_dominant_wall_thickness`：细长连通域短边的中位数 | **P1**。双线 CAD 估中心线厚度，给默认 `wall.thickness` |
| 缺口闭合但不封门 | `_join_close_walls_without_openings`：横/竖 MORPH_CLOSE，门窗膨胀区不补 | **P1**。和 `stitch-walls` / `mergeMissedInkWalls` 同类，比盲目补线安全 |
| 正交折一下 | `_snap_to_rectilinear`：边偏 15° 内拉成水平/垂直 | **P1**。认墙后处理即可，编辑器磁性是另一层 |
| 房间洞填上 | `fill_background_holes`、孤立 Undefined 并进邻房 | 不改墙图；标签钉住见 SH3D 文档 |
| 围合评分扩房间 | `_boundary_support_score`：标签只在墙围里扩 | **P1**。厨房只标了中心时，用围合度警告未闭合（补 `unclosedRoomNames`） |
| 外墙贴图边 | 多边形碰到图像边 → External | **P1**。`outerLoop` 至少两端应靠近建筑外沿，不是图签 |
| 门窗条带化 | `_regularize_opening_component`（未调用） | 只学思路：开口宽度跟墙厚对齐 |

IFC 挤出（墙 3.0 m、门 2.1 m、窗台 0.6 m、窗 1.5 m、门上墙垛）只当「3D 默认高度表」，不要上 IfcOpenShell。

**不要导入：** 无许可源码、对不上的训练脚本、固定 `1px=1cm`、把 IFC 当交换格式。墙多边形不要当 `innerWalls`。

### 2.2 dwg-bim_AI（仓库是空壳）

**声称：** U-Net / Mask R-CNN → 矢量 → DWG / IFC，Python 可本地跑。  
**实际：** 没有 `src/`、没有 notebook。只有：

- `Models/wall_segmentor.pt`、`image_segmentor.pt`（YOLO 权重，给 Structify 用）
- `data/README.md` 两个 Roboflow 链接
- README 复制了 Structify 的开头

**结论：没有可借鉴的代码。** 权重是西方 Roboflow 墙/平面分割，对中国 CAD 双线、尺寸界线没有域适应说明。不要当本地认墙引擎。

### 2.3 Structify-AI（流程完整，工程是作业级）

**声称：** FastAPI，YOLO 实例分割 → 分割图 + GeoJSON + 3D GLB。  
**实际：** 单文件 Colab 脚本（`!pip`、`drive.mount`、`/content/drive/MyDrive/...`）。`uvicorn main:app` 对不上文件名。墙 / 房间 / 家具三个 YOLO 头（墙单独一个模型）。前端在另一个仓库。

可看的部分：

- **墙 / 房间 / 家具分开检**，各类自己的置信度（`CLASS_THRESHOLDS`）。我们认墙和摆家具已经分开（技能包第 11 条），阈值表可以学：墙严、家具松。
- **房间类表**（Bedroom / Kitchen / toilet / walkin…）和 `place-findings` 的房间名可以对一张映射，不要另起 GeoJSON 运行时。
- **家具类表**（Bed / Sofa / Wardrobe / door / sink…）对照 `src/constants.ts` ITEMS，缺的记进补件清单，不要上他们的 Drive GLB。
- GeoJSON 只是「多边形 + label」。我们的 `DetectedPlacements` 已经够用；多一层 GeoJSON 没有收益。
- GLB 挤出房间是示意网格，不是可编辑墙图。我们 3D 已从 `Floorplan` 长出来。

**不要导入：** Colab 一体脚本、Drive 路径、墙高写成 `100.0`（房间却是 3.0，单位乱）、`Point(0,0)` 假多边形兜底、源码里的 ngrok token、空 `.pt`。Filled 墙多边形当墙（和中心线冲突）。

### 2.4 Arc（题不对）

**声称：** 手机/摄像头实时扫房间，YOLOv8 + MiDaS/DPT → 3D。  
**实际：** [babasveeramallu/arc-image-identifier](https://github.com/babasveeramallu/arc-image-identifier)。对着**真实墙面**拍：DPT 深度 → 点云 → RANSAC 平面 → ICP 拼多面墙 → PLY。YOLO 类是插座 / 开关 / 镜子，不是户型图墙线。Hackathon 体量（约 900 行）。

**结论：不进认墙路线。** 和第一人称扫描是另一条产品，MVP 已排除。不要把深度估计接到 2D 户型图上。

### 2.5 MitUNet（唯一像样的墙掩码论文实现）

**声称：** MiT-b4 编码器 + U-Net 解码 + scSE，Tversky Loss，专打细墙。  
**实际：** 和论文一致，只出 512×512 二值墙掩码，没有中心线、没有家具。`experiments/models/*.pth` 本机是 134 字节 LFS 指针，要 `git lfs pull` 才有约 257 MB 的权重。CubiCasa 训出来的权重是 **CC-BY-NC**，商用不能直接挂进产品。`datasets/regional/`（Floor Plan CIS，约 500 张，带尺寸线/家具叠字）可以当离线抽检集。

借鉴点：

- **细墙要高召回：** Tversky α=0.6 / β=0.4。我们 LLM 常见漏承重厚墙、误检开间细线——方向相反，约束应是「厚双线必留、细单线必丢」（已有 `dropThinDimensionWalls`）。
- **训练时把门窗从墙 GT 里挖掉：** 门窗 `minAreaRect` 短边加厚约 30 px 再从墙掩码减去。和我们「墙不断、洞是开口」一致，可对照 `opening-wall` / `punchDetectedOpenings`。
- **边界 IoU（B-IoU）：** 按图对角线约 2% 膨胀后比边界带。比整图 mIoU 更贴近 CAD 墙边。可给 `judge-walls.ts`：LLM 折线栅格化 vs `constrain-ink` 墨迹。
- **掩码当地板墨迹：** 若以后要本地辅助，出墙概率图喂给 `constrainTraceToInk`，**不要**用掩码轮廓当中心线。双线 CAD 会描两皮。
- CubiCasa / CIS 域差大。没有中国 CAD 微调，直接当认墙模型会把轴线、尺寸界线当墙。

**不要导入：** 训练 notebook、NC 权重进商业产品、把分割 mIoU 当验收、512 推理不还原 overlay 比例。

---

## 3. 值得做的（按我们现状）

### P0 — 写进现有 `src/vision/`，不换模型

1. **开口必须贴墙**  
   Floor-Plan `remove_floating_openings`。`place-findings` / `judge-walls`：开口中心到最近墙 > 阈值则丢，写入 `warnings`。

2. **认墙后 15° 正交折一下**  
   Floor-Plan `_snap_to_rectilinear`。只对 `innerWalls` / `outerLoop` 折线做，用户仍可用编辑器磁性关掉。CAD 真斜墙少，扫描件描摹时再关。

3. **墙 / 家具阈值分开 + 别名表**  
   Structify 分头阈值：认墙严、家具松。房间/家具英文类名补进 `catalog-pick.ts` 和技能包（utility / walkin / commode / kitchen-slab），映射失败走 S14。

4. **B-IoU 当核对分数**  
   MitUNet 边界带 IoU。`judge-walls.ts` 比较折线栅格和墨迹，比只数段数更贴墙边。

### P1 — 后处理增强，仍走 LLM

5. **从墨迹估墙厚**  
   `_dominant_wall_thickness` 的短边中位数，写入默认 `thickness`（10/15/20 cm 分桶）。双线中心线宽度比像素短边更准时，用双线间距。

6. **补墙避开门洞**  
   `_join_close_walls_without_openings`。`stitch-walls` / 本地补线时膨胀 openings，禁止把门封死。

7. **房间名对照表**  
   Floor-Plan `ID_TO_LABEL` + Structify `ROOM_CLASSES` → 客厅/主卧/厨/卫。只做别名。

8. **CIS 图当抽检集**  
   `tmp/mitunet/datasets/regional/` 带尺寸线和家具叠字，可丢进 `tmp/ai-detect/` 做回归，不训模型。

9. **房间围合分 + 外墙贴边**  
   Floor-Plan enclosure / border-touch。`judge-walls.ts`：房间名中心若墙围合度低就警告；`outerLoop` 不应整段落在图签里。

### P2 — 明确后置

| 项 | 原因 |
|---|---|
| 本地 SegFormer / MitUNet 当 ink 先验 | 要 GPU、要中国 CAD 微调；现在 LLM + `constrain-ink` 够用 |
| YOLO 家具实例分割 | 户型图符号和照片家具不是一类；继续 findings + `catalog-pick` |
| IFC / DWG 导出 | 计划排除；JSON + draw.io 已有 |
| GeoJSON 中间层 | 和 `DetectedPlacements` 重复 |
| Arc 摄像头建房 | 不是户型图产品 |
| 训自己的墙分割 | CubiCasa ≠ 中国施工图；工期等于另开一条 ML 线 |

---

## 4. 明确不要做

- 把运行时从「LLM JSON」改成「分割掩码 → 轮廓」。掩码是墙皮，我们要中心线。
- 为了对齐开源项目去训 RTX 5090 的 Mask2Former。
- 把无 LICENSE 的 Floor-Plan 源码拷进 `src/`。
- 把 Arc / MiDaS 深度接到 2D 底图校准（比例来自 OCR 总宽，不是单目深度）。
- 把 IFC 或 GeoJSON 当成 `loadSerialized` 的第二种格式。
- 把 Roboflow / CubiCasa 指标写成产品验收。
- 把 MitUNet 的 CC-BY-NC 权重挂进商业产品（代码 MIT，权重不行）。

---

## 5. 和现有文件怎么接

| 借鉴 | 落点 |
|---|---|
| 漂浮开口过滤 | `src/vision/place-findings.ts`、`judge-walls.ts` |
| 15° 折线 | `src/vision/stitch-walls.ts` 或新 `snap-rectilinear.ts` |
| 补线避门 | `src/vision/stitch-walls.ts`、`constrain-ink.ts` |
| 墙厚估计 | `src/vision/build-floorplan.ts` → `SavedFloorplan.walls[].thickness` |
| 房间 / 家具别名 | `src/vision/catalog-pick.ts` / `ai-floorplan-skill-pack.ts` |
| 分头阈值 | `app/app/api/ai/walls/route.ts` 与后续家具接口分开 |
| B-IoU 核对 | `src/vision/judge-walls.ts`、`detect-dump.ts` |
| 房间围合 / 外墙贴边 | `src/vision/judge-walls.ts`、`place-findings.ts` |

编辑器侧（磁性、尺寸线、不拆墙开门）仍看 `docs/design/sweethome3d-7.7-online.md`，不要从这些 Python 项目里找 UI。

---

## 6. 一句话

五个仓库里，**只有 Floor-Plan 的几何后处理和 MitUNet 的「细墙掩码」值得对照**。Structify / dwg-bim 是同一套未完成的 YOLO 作业（权重和 Colab 拆开了）。Arc 扫的是真房间，不是户型图。我们继续以 LLM 中心线为主，把「门要贴墙、折线可正交、补线不封门、墨迹估墙厚」收进现有 vision 管线即可。
