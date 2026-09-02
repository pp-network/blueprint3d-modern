---
name: floorplan-rooms
description: >-
  Read room names on Chinese floor plans (客厅, 主卧, 厨房, 卫生间).
  Use when labeling rooms on a 户型图 or filling findings.rooms.
---

# 户型房间名

只记录建筑本体里写出来的名字（CAD 里常是黄字）。不要按功能猜没写的房间。
不要把图签、图例、软件界面上的字当成房间名。

常见：客厅、餐厅、主卧、次卧、书房、厨房、卫生间、阳台、玄关、衣帽间。

`findings.rooms` 里 `x,y` 取该房间地面空地中央，不要点在墙上、图框上，也不要点在客厅中间那条「1客厅/1生活阳台/…」房间目录横条上。不要把所有房间名排成同一水平线。坐标是像素，原点左上。

房间名不是墙。不要为了让房间封闭而补墙。
