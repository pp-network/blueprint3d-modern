---
name: floorplan-walls
description: >-
  Extract architectural walls from Chinese CAD / 户型图 images into
  outerLoop + innerWalls. Use when detecting walls, importing a floor plan,
  tracing 外墙/隔墙, or debugging AI wall hallucination.
---

# 户型认墙

只临摹画出来的墙。不要设计房间。思考用简体中文。

运行时提示词：`src/vision/ai-walls-prompt.ts`（含技能包）。
结果经 `applyWallTraceToModel` 入库。禁止编造 `model_url`。

## 规则

1. OCR 文字只用于比例和房间名。数字不是墙。
2. `outerLoop` 必须先完整写出：建筑最外圈，含阳台外沿和每一个凹凸拐角，不是图幅外接框，也不是只画一段。
3. `innerWalls` 必须对应连续深色隔墙。门洞处断开，不要把门弧连成实墙。
4. 衣帽间只画房间四壁；柜体/层板平行细线不是墙。门、窗、家具、楼梯、填充、标题栏、尺寸线一律不描。
5. 看不清就省略。不要为了封闭房间而补墙，不要对称抄墙。
6. 模型返回后跑墨迹约束和柜体过滤（`constrainTraceToInk` / `mergeMissedInkWalls` / `dropCabinetLikeWalls`）。

## 模型

认几何用文档视觉模型（`gemini-3.1-pro`），不要用默认写代码模型。
