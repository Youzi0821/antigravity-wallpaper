# Antigravity 聊天壁纸

Windows 本地外观扩展。由 Google Antigravity 桌面版启动 sidecar，自动连接本机窗口。可以在应用背景中播放已有的 Wallpaper Engine 视频壁纸，或显示自己的图片。已验证 Antigravity 2.35.2。

Windows 安装包和 SHA-256 校验文件见 [GitHub 发布页](https://github.com/Youzi0821/antigravity-wallpaper/releases)。这个项目是独立的社区扩展。

## 安装

1. 解压安装包，保留目录里的脚本和源文件。需要将 Node.js 22.1 或更新版本加入 PATH。
2. 从 Antigravity 菜单退出应用，双击 `Install.cmd`。
3. 从已配置本机调试端口的快捷方式打开 Antigravity。在「自定义配置 → 已安装 → 插件」中启用 **Antigravity Wallpaper**，然后点击窗口右下角的 Gemini 猫猫图标设置壁纸。

从旧版升级时直接运行新版 `Install.cmd`。如果旧版应用补丁仍在生效，安装器会校验备份、还原原版应用包并保留壁纸设置。

如果已经用同一个快捷方式运行 agy-capsule 或 Hagemi Pet，可以继续使用它。首次配置可在 Antigravity 快捷方式的「目标」末尾加上 ` --remote-debugging-address=127.0.0.1 --remote-debugging-port=0`。应用更新后若快捷方式被重置，需要恢复这两个参数。

## 使用

- Antigravity 的全局插件开关会同时控制壁纸和猫猫图标。重新启用插件后会恢复原来的壁纸设置。
- 「选择文件」支持 MP4、M4V、WebM、JPG、PNG、WebP、AVIF、GIF 和 BMP。视频默认静音循环。
- 「Steam 壁纸库」从 Steam 登记的库查找 Wallpaper Engine 项目。也可以用「选择库文件夹」指定 Steam 库根目录或 `steamapps\workshop\content\431960`，再搜索壁纸名称。
- 有预览图的 Scene 或 Web 壁纸可作为静态背景。场景渲染和网页脚本暂不支持。
- 可调主题遮罩、亮度、饱和度、锐化、灰度、模糊、播放速度和水平翻转。窗口隐藏或系统开启减少动态效果时，视频暂停。关掉「启用壁纸」可恢复默认背景。
- 拖动猫猫可以移动壁纸按钮，松手后会记住位置。也可以在按钮获得键盘焦点时用方向键微调。
- 壁纸启用时，新建对话和已有对话的发送框使用透明玻璃样式。
- 打开内置浏览器时，聊天区继续显示壁纸，右侧工作台的标签栏、地址栏和新标签页使用毛玻璃样式。
- 「自动化」和「自定义配置」的内容区与侧栏共用同一层壁纸。
- 壁纸延伸到应用内菜单栏。Windows 原生最小化、最大化和关闭按钮的背景由 Antigravity 绘制。

## 卸载

退出 Antigravity 后，双击 `Uninstall.cmd`。壁纸偏好保存在 Antigravity 用户数据目录的 `wallpaper-settings.json`。

安装脚本将插件注册到 `~/.gemini/config/plugins/antigravity-wallpaper/`。AGY 负责启动 sidecar，sidecar 会在窗口重载后重新挂载壁纸。运行期间无需改写 `app.asar` 或维护 AGY 版本号白名单。

如果未来 AGY 改变调试接口或界面结构，对应的渲染仍可能需要更新。

## 源码与测试

安装包包含完整扩展源码和测试，运行时无需额外的 npm 依赖。

```powershell
node --test wallpaper-library.test.cjs wallpaper-settings.test.cjs
node manage.cjs check
```

要从当前提交生成完整安装包，在 Git 仓库内运行：

```powershell
git archive --format=zip --prefix=antigravity-wallpaper/ --output=Antigravity-Wallpaper-Windows.zip HEAD
```

## 授权与致谢

软件源代码使用 [MIT](LICENSE)。猫猫图像 `gemini-cat.webp` 适用 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)，完整署名见 [NOTICE.md](NOTICE.md)。

功能参考 [dsh-wallpaper-engine](https://github.com/elysia395/dsh-wallpaper-engine)。
