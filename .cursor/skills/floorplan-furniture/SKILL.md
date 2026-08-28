---
name: floorplan-furniture
description: >-
  Recognize furniture and fixture symbols on Chinese 户型图 and map them
  to catalog kinds. Use when detecting 床/沙发/柜/门窗 or filling findings.furniture.
---

# 户型家居

家具是符号，不是墙。橱柜靠墙的厚块不要描进 `innerWalls`。

## 映射到目录类别

| 图上符号 | kind |
| --- | --- |
| 床 / 双人床 / 榻榻米 | bed |
| 沙发 / 转角沙发 | sofa |
| 单人沙发 | armchair |
| 餐桌 / 茶几 / 书桌 | table |
| 椅 / 餐椅 | chair |
| 衣柜 / 衣帽间 | wardrobe |
| 床头柜 / 斗柜 | drawer |
| 储物柜 | storage |
| 凳 | stool |
| 门 | door |
| 窗 | window |

马桶、浴缸、灶台、冰箱若能看清，写入 `name`（中文），不要当墙。

## 禁止

- 编造 `model_url`（只能用 `src/constants.ts` 的 `ITEMS`）
- 为了对称而摆没画的家具
- 把虚线、填充、尺寸线当成家具轮廓
