# 豪士藜麦吐司蛋白质合成大挑战

一个完整可运行的移动端 H5 合成游戏，玩法参考《合成大西瓜》。

## 项目结构

```text
haoshi-protein-game/
  index.html
  styles.css
  app.js
  assets/
    egg.png
    milk.png
    quinoa.png
    flour.png
    dough.png
    toast-slice.png
    haoshi-quinoa-toast.png
    haoshi-logo.png
    haoshi-toast-pack.png
    ingredient-sheet.png
  vendor/
    matter.min.js
    html2canvas.min.js
  README.md
```

## 运行方式

直接打开 `index.html` 即可游玩。也可以在当前目录启动任意静态服务后访问页面。

## 技术栈

- HTML5
- CSS3
- JavaScript ES6
- Matter.js
- html2canvas
- localStorage

## 功能

- 点击屏幕选择落点，食材从顶部掉落。
- 相同食材碰撞自动升级。
- 每个食材使用独立 PNG 完整图片显示。
- 合成时触发闪光、缩放、粒子爆炸和蛋白质飘字。
- 终极合成触发全屏金色粒子、震动、奖杯动画和“蛋白质大爆发！”。
- 自动生成豪士蛋白质认证证书，可保存 PNG。
- 本地排行榜保存前 10 名。
- 适配 iPhone、Android 和平板。
