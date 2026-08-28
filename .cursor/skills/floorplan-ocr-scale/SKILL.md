---
name: floorplan-ocr-scale
description: >-
  Read Chinese CAD dimension text (总宽, 开间, 进深, axis ticks) for scale only.
  Use when calibrating overlay mm, OCR on 户型图, or checking 18670 / overall width.
---

# 户型 OCR 比例

## 用来干什么

- 图纸总宽 / 进深（毫米）
- 房间名旁的开间尺寸
- 轴线刻度

写入底图「图纸总宽」用 **mm**。`applyWallTraceToModel` 会再除以 10 得到 cm。

## 不能用来干什么

- 根据长度文字去推断缺失的墙
- 为了「加起来刚好」而多画开间
- 把尺寸界线当成墙中心线

## 印刷总宽和用户填写不一致

保留墨迹上的像素坐标。不要为了数字去改建筑形状。
