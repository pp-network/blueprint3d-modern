---
name: floorplan-furniture
description: >-
  Recognize furniture and fixture symbols on Chinese 户型图 and map them
  to catalog kinds. Use when detecting 床/沙发/柜/门窗 or filling findings.furniture.
---

# 户型家居

家具是符号，不是墙。橱柜靠墙的厚块不要描进 `innerWalls`。
图层关不掉时：只认建筑本体里的符号，不要认图签、图例、软件界面里的小样。

CAD 黑底图常见：青线=家具，白粗双线=墙。青线轮廓写入 `findings.furniture`，不要描成墙。

## 映射到目录类别

| 图上符号 | kind |
| --- | --- |
| 床（带枕头的矩形）/ 榻榻米 | bed（主卧写「双人床」，次卧/儿童房写「单人床」） |
| 沙发 / 转角沙发 / 多人沙发 | sofa |
| 单人沙发 / 休闲椅 | armchair |
| 圆桌 / 餐桌 / 茶几 / 书桌 | table |
| 椅 / 餐椅 | chair |
| 靠墙柜 + X 填充 | wardrobe |
| 床头柜 / 斗柜 | drawer |
| 其他矮柜 | storage |
| 凳 | stool |
| 门弧 / 平开门 / 推拉门（墙内两道短平行线） | door（只进 openings；每个闭合房间至少一扇） |
| 窗 / 落地玻璃 | window（只进 openings） |

马桶、浴缸、台盆、灶台、冰箱若能看清，写入 `name`（中文），不要当墙。目录没有对应模型就只记名字。
橱柜、岛台、洗手台厚块不是 wardrobe，除非能看清是衣柜符号。

门、窗的洞口中心写入 `findings.openings`（`kind` 为 `door` 或 `window`）。门扇/门弧不要画成短墙。

## 禁止

- 编造 `model_url`（只能用 `src/constants.ts` 的 `ITEMS`）
- 为了对称而摆没画的家具
- 把虚线、填充、尺寸线、图签图例当成家具轮廓
