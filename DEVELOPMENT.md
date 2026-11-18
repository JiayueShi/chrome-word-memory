# 实现与开发说明

普通使用者请从 [README](README.md) 开始。这里记录数据来源、实现边界和开发验证方式。

## 复习与备份细节

- 复习间隔：忘了，10 分钟后；模糊，1 天后；连续记住，1、3、7、14、30、60 天后。
- 重复收藏不会重置复习进度，也不会覆盖已有的个人笔记。
- 备份为 JSON 文件，包含原句、笔记和复习记录。导入时合并新单词，已有单词保留当前记录。最多 5000 词，导入文件上限 8 MB。
- 词源自动翻译只处理原文开头 500 个字符，完整英语原文和来源链接保留。

## 本地与联网

生词、笔记、缓存和复习记录使用 chrome.storage.local，保存在当前 Chrome 配置中，不需要账号，不同步到服务器。查词会把查询词发给公开词典；只有点击自动翻译时，才把相应词典文本发给翻译接口。原网页句子不发给这些服务。

发音通过 Chrome 扩展的本机语音接口合成，不请求词典音频链接，也不把单词发给远程语音服务。

不联网时仍可使用已保存的生词本和缓存；新词查询需要联网。缓存最多 200 项、7 天内优先直接使用；超过期限会尝试更新，网络失败时保留旧结果。Chrome 本地存储也有容量上限，遇到保存失败请导出备份并清理部分词条。

卸载扩展、删除 Chrome 配置或清除扩展存储可能删除记录，请定期导出备份。更新版本时建议保留同一 extension 文件夹的路径，再在 chrome://extensions 点击刷新；先备份最稳妥。

## 范围与数据来源

支持普通 HTTP/HTTPS 网页的顶层文档。Chrome 内部页面、Chrome 商店、内置 PDF、跨域 iframe 或不能选中文字的区域，请改用扩展图标手动输入。默认不启用本地 file 页面权限，也不做截图 OCR。输入框、密码框和可编辑区域不会自动取词。

释义来自 Free Dictionary API，词源和中文译词来自英语 Wiktionary 及 Kaikki 的 Wiktionary 数据镜像；自动翻译来自 MyMemory。这些公开服务可能有访问限制、配额或临时故障；任一来源失败，不会阻止其他来源显示结果。词条覆盖不是全量离线词典，派生词或复数可能没有独立词源，可以查其基础词形。

词源使用公开词条的文本解析，保留英语段、多个词源分支和来源链接；词根/构词按词源分支编号标明，避免混淆同形词的不同起源；复杂模板不一定完整展示。星号标记的原始语词根是语言学重建形式，不是今天的英语词。历史词源、来源记录的构词和用户自己的记忆联想是不同信息；扩展不根据拼写编造词根。源条目可能有多种义项，结合阅读语境判断。

详见 THIRD_PARTY.md。无付费密钥、生成式 AI、广告和遥测。

## 开发与验证

无需 npm install。测试使用 Node 内置测试框架：

    npm test
    npm run package

浏览器测试需 Playwright 和独立 Chromium/Chrome for Testing，可设置环境变量（默认用捕获的真实 API 响应验证交互；增加 WORD_MEMORY_LIVE=1 可验证首个词的真实联网查询）：

    PLAYWRIGHT_MODULE=/绝对路径/playwright-core/index.mjs \
    WORD_MEMORY_BROWSER=/绝对路径/Chrome-for-Testing可执行文件 \
    node scripts/browser-smoke.mjs

示例阅读页位于 demo/reading.html。若要验证网页划词，可在本项目目录运行 python3 -m http.server 8769 --bind 127.0.0.1，然后访问 http://127.0.0.1:8769/demo/reading.html。平时使用扩展无需此服务器。

录制用法演示使用 scripts/record-demo.mjs（与浏览器测试相同的两个环境变量）。脚本在独立临时 Chrome 配置里操作真实扩展，用捕获的词典响应避免网络等待；字幕、光标提示和界面放大仅用于录制。可设置 WORD_MEMORY_RECORDING 指定 Retina PNG 帧、帧时间清单和检查截图的输出目录，不接触日常 Chrome 的生词记录。

本机语音回归验证（需已安装英语系统语音）：用相同的 PLAYWRIGHT_MODULE 和 WORD_MEMORY_BROWSER 运行 node scripts/browser-speech.mjs，覆盖网页禁止外部音频、断网、生词本、复习和缺少英语语音的提示，并检查真实语音引擎的 start/end 事件。

音标回归：用相同的 PLAYWRIGHT_MODULE 和 WORD_MEMORY_BROWSER 运行 node scripts/browser-ipa.mjs，验证 general 的 IPA 字符、网页禁止字体加载和离线卡片。音标使用本地 Noto Sans 子集，以 FontFace 字节缓冲加载；运行时不请求远程字体。
