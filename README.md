# Antigravity 聊天壁纸

Windows 本地外观扩展，适配 Google Antigravity 2.33.0 和 2.34.0 独立桌面版。可以在应用背景中播放已有的 Wallpaper Engine 视频壁纸，或显示自己的图片。

Windows 安装包和 SHA-256 校验文件见 [GitHub 发布页](https://github.com/Youzi0821/antigravity-wallpaper/releases)。这个项目是独立的社区扩展。

## 安装

1. 解压安装包，保留目录里的脚本和源文件。需要已安装 Node.js 20 或更新版本。
2. 从 Antigravity 菜单退出应用，双击 `Install.cmd`。
3. 打开 Antigravity。在「自定义配置 → 已安装 → 插件」中可以找到全局插件 **Antigravity Wallpaper**。点击窗口右下角的 Gemini 猫猫图标设置壁纸。

若旧版壁纸扩展仍在生效，先运行 `Uninstall.cmd`，再安装新版。若 Antigravity 更新已覆盖壁纸扩展，直接运行 `Install.cmd` 即可。已有的壁纸偏好会保留。

## 使用

- Antigravity 的全局插件开关会同时控制壁纸和猫猫图标。重新启用插件后会恢复原来的壁纸设置。
- 「选择文件」支持 MP4、M4V、WebM、JPG、PNG、WebP、AVIF、GIF 和 BMP。视频默认静音循环。
- 「Steam 壁纸库」从 Steam 登记的库查找 Wallpaper Engine 项目。也可以用「选择库文件夹」指定 Steam 库根目录或 `steamapps\workshop\content\431960`，再搜索壁纸名称。
- 有预览图的 Scene 或 Web 壁纸可作为静态背景。场景渲染和网页脚本暂不支持。
- 可调主题遮罩、亮度、饱和度、锐化、灰度、模糊、播放速度和水平翻转。窗口隐藏、内置浏览器显示或系统开启减少动态效果时，视频暂停。关掉「启用壁纸」可恢复默认背景。
- 拖动猫猫可以移动壁纸按钮，松手后会记住位置。也可以在按钮获得键盘焦点时用方向键微调。
- 壁纸启用时，新建对话和已有对话的发送框使用透明玻璃样式。
- 「自动化」和「自定义配置」的内容区与侧栏共用同一层壁纸。
- 壁纸可以延伸到原有菜单栏和 Windows 窗口按钮后面。

## 卸载

退出 Antigravity 后，双击 `Uninstall.cmd`。卸载脚本会移除全局插件条目，并校验和恢复备份的 `app.asar`。壁纸偏好保存在 Antigravity 用户数据目录的 `wallpaper-settings.json`。

安装脚本将 `plugin.json` 注册到 `~/.gemini/config/plugins/antigravity-wallpaper/`，并安装渲染壁纸所需的桌面端补丁。

应用更新可能覆盖扩展。安装器会验证版本和需要的接口，发现版本不符时停止。若另一项修改在安装之后改过同一个应用包，卸载器会拒绝自动覆盖。

## 源码与测试

安装包包含完整扩展源码和测试，运行时无需额外的 npm 依赖。安装器从本机的 Antigravity 生成补丁，发布包只包含本项目文件。

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
