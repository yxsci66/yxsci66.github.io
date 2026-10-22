---
title: "formatting on vscode"
description: "本文给出一个可行的解决eslint和prettier同时生效的vscode的解决方案。"
pubDate: 2022-06-29
updatedDate: 2022-06-29
category: "engineering"
tags:
  - "沙滩拾贝"
featured: true
legacyPaths:
  - "/2022/06/29/formatting-on-vscode/"
---

# eslint和prettier

本文给出一个可行的解决eslint和prettier同时生效的vscode的解决方案。

## 安装流程

```plaintext
yarn add eslint prettier eslint-config-prettier eslint-plugin-prettier -D 

// 生成.eslintrc.js，并根据选项下载对应的包
npx eslint --init 
    eslint somename.js --fix // 原理：执行格式化脚本命令进行格式化
//eslint插件安装


    npx prettier --write index.js // 原理：脚本格式化
.prettierrc.js //手动创建
//prettier插件安装


//eslint-config-prettier 的作用是关闭eslint中与prettier相互冲突的规则。
//eslint-plugin-prettier 的作用是赋予eslint用prettier格式化代码的能力
```

## 配置文件

### setting.json

```plaintext
{
  "editor.formatOnSave": true,
  // 配置prettier为默认格式化工具，以vue为例
  "[vue]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  // 配置 ESLint 检查的文件类型
  "eslint.validate": [
    "javascript",
    "vue",
    "html"
  ],
}
```

### .eslintrc.js

```plaintext
{
    extends: [
        "plugin:prettier/recommended",
    ],
}
```

> [https://segmentfault.com/a/1190000015315545](https://segmentfault.com/a/1190000015315545)  
> [https://juejin.cn/post/6990929456382607374](https://juejin.cn/post/6990929456382607374)  
> [https://juejin.cn/post/7012160233061482532](https://juejin.cn/post/7012160233061482532)
