easy-inno 完整產品與技術規格

你現在的產品方向已經相當清晰：Windows x64 專用、零外部安裝依賴、直接內置 Node.js Runtime 和 Inno Setup compiler，將可在本機 production preview 運行的 Node.js 專案打包成 Windows 安裝程式。

本規格固定使用 Node.js 26.13.0「Lithium」LTS x64。該版本於 2026 年 10 月 28 日進入 LTS，預計維護至 2029 年 4 月。官方提供 Windows x64 ZIP、MSI 和獨立 node.exe；本專案應使用完整的 node-v26.13.0-win-x64.zip 作為內置 Runtime，官方 SHA-256 為 dcc60d59a0746999f99064a01c020445d54d84228c691cdbf25b49ac3b59150a。

1. 專案基本資料
   1.1 專案名稱
   easy-inno

1.2 npm package
easy-inno

1.3 定位

easy-inno 是一個 Windows x64 專用的 Node.js 應用程式安裝檔建構工具。它內置固定版本的 Node.js Runtime 和 Inno Setup compiler，使用者無須另外安裝 Node.js、npm 或 Inno Setup，即可將 production-ready Node.js 專案建構成單一 Windows Setup .exe。

1.4 目標使用體驗
npm install --save-dev easy-inno
npx easy-inno init
npx easy-inno build

輸出：

release/
└─ MyApp-Setup-1.0.0.exe

目標電腦：

不需要安裝 Node.js
不需要安裝 npm
不需要安裝 Inno Setup
不需要連接網絡
不需要 Visual Studio
不需要 Python
不需要 Git
若採用 per-user 安裝，不需要管理員權限 2. 核心設計原則
2.1 單一設定來源

所有設定均儲存在：

package.json

不生成：

easy-inno.config.js
easy-inno.config.json
easy-inno.yaml

npx easy-inno init 直接修改 package.json，加入：

scripts.package:win
easyInno
必要的預設值

這樣用戶不需要同步維護兩份設定。

2.2 固定內置 Runtime

easy-inno v1 預設及唯一支援：

Node.js: 26.13.0 LTS
Platform: win32
Architecture: x64
Runtime distribution: node-v26.13.0-win-x64.zip

不使用：

process.execPath

作為最終 Runtime。

原因是使用 build 電腦上的 Node.js 會導致：

不同開發者產生不同 Runtime
CI 和本機結果不同
Node ABI 不固定
native module 相容性不可預測
build 結果無法重現

easy-inno 必須使用套件內置的固定 Runtime。

2.3 Preview 與安裝後一致

easy-inno 不會提供自己的 preview command。

這裡的 preview 指：

npm run preview

產品契約是：

npm run preview 所測試的 production entry、production output 和啟動方式，應與安裝後由內置 Node.js Runtime 執行的內容一致。

推薦專案設定：

{
"main": "dist/index.js",
"scripts": {
"build": "tsc",
"start": "node dist/index.js",
"preview": "npm run build && npm run start",
"package:win": "easy-inno build"
}
}

本機 Preview：

系統 Node.js
└─ dist/index.js

安裝後：

<install-dir>\runtime\node.exe
└─ <install-dir>\app\dist\index.js

兩邊必須使用相同的：

production entry
production build output
application arguments
working directory
NODE_ENV=production
production dependencies

但是 easy-inno 不保證任意 scripts.preview 都能轉換成安裝後執行方式。例如：

{
"preview": "vite preview"
}

這只代表啟動 Vite 的預覽 server，不等同於一個可直接安裝的 Node.js 應用程式。

3. 支援範圍
   3.1 MVP 支援
   Windows 10 x64
   Windows 11 x64
   Node.js CLI application
   Node.js console application
   Node.js HTTP server application
   TypeScript 編譯後的 Node.js application
   CommonJS
   ES Modules
   npm
   package-lock.json
   production dependencies
   native npm modules
   per-user 安裝
   per-machine 安裝
   開始功能表捷徑
   桌面捷徑
   安裝後啟動
   解除安裝
   應用程式升級安裝
   自訂 icon
   自訂 application arguments
   自訂 environment variables
   自訂 include/exclude
   3.2 MVP 不支援
   macOS
   Linux
   Windows x86
   Windows ARM64
   pnpm
   Yarn
   Bun
   Electron-specific packaging
   Node.js SEA
   自動 code signing
   Microsoft Store/MSIX
   MSI 輸出
   Windows Service 自動註冊
   Docker
   從網絡下載 Runtime
   使用系統 Inno Setup
   使用系統 Node.js 作為最終 Runtime
4. 專案類型限制

easy-inno 不能將任何 Node repository 無條件轉換成 Windows 應用程式。

可打包專案必須具有可執行的 production entry：

{
"main": "dist/index.js"
}

或：

{
"easyInno": {
"entry": "dist/index.js"
}
}

4.1 支援範例
CLI 應用程式
{
"main": "dist/cli.js",
"scripts": {
"build": "tsc",
"preview": "npm run build && node dist/cli.js"
}
}

Express/Fastify server
{
"main": "dist/server.js",
"scripts": {
"build": "tsc",
"preview": "npm run build && node dist/server.js"
}
}

自帶前端和 Node server 的應用
dist/
├─ server.js
└─ public/
├─ index.html
└─ assets/

{
"main": "dist/server.js"
}

4.2 不可直接打包的範例

只有 Vite 靜態前端：

{
"scripts": {
"build": "vite build",
"preview": "vite preview"
}
}

因為：

dist/index.html

不是 Node.js executable entry。

使用者必須提供 production server，例如：

// server.mjs

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const publicDirectory = path.resolve("dist");

createServer(async (request, response) => {
const file = await readFile(
path.join(publicDirectory, "index.html")
);

response.writeHead(200, {
"Content-Type": "text/html"
});

response.end(file);
}).listen(4173, "127.0.0.1");

5. CLI 規格
   5.1 可用命令
   easy-inno init
   easy-inno build
   easy-inno doctor
   easy-inno config
   easy-inno clean
   easy-inno version

6. easy-inno init
   6.1 目的

建立 easy-inno 的初始設定，但不建立第二份 config。

npx easy-inno init

直接修改：

package.json
.gitignore

6.2 執行前檢查

必須確認：

process.platform === "win32"
process.arch === "x64"
當前目錄存在 package.json
package.json 是有效 JSON
name 存在
version 存在
scripts 可被安全修改
6.3 自動讀取欄位
easy-inno 資料 package.json 來源package name name
顯示名稱 productName → name
版本 version
Publisher author.name → author
描述 description
production entry easyInno.entry → main → 自動推斷
build command scripts.build
preview command scripts.preview
license license
6.4 Entry 推斷順序

1. easyInno.entry
2. main
3. bin，只有單一值時
4. dist/index.js
5. dist/main.js
6. dist/server.js
7. build/index.js
8. build/main.js
9. lib/index.js
10. index.js

如果找到多個候選，顯示選擇：

? Select the production entry:

> dist/index.js
> dist/main.js
> dist/server.js

如果完全找不到：

? Enter the production entry:

> dist/index.js

6.5 互動問題
$ npx easy-inno init

easy-inno initialization

Project: my-node-app
Version: 1.0.0
Build command: npm run build
Entry: dist/index.js
Runtime: Node.js 26.13.0 LTS x64

? Installation mode:

> Current user
> All users

? Application type:

> Console
> Background/windowed

? Create Start Menu shortcut? Yes
? Create Desktop shortcut? No
? Launch application after installation? Yes
? Installer output directory: release
? Application icon: assets/app.ico

Updated package.json
Updated .gitignore

Run:
npm run package:win

6.6 Non-interactive mode
npx easy-inno init --yes

預設：

{
"installMode": "perUser",
"applicationType": "console",
"startMenuShortcut": true,
"desktopShortcut": false,
"launchAfterInstall": true,
"outputDirectory": "release"
}

6.7 其他參數
npx easy-inno init --yes
npx easy-inno init --dry-run
npx easy-inno init --force

--dry-run

只顯示 JSON diff，不寫入檔案。

--force

只補回缺少的必要欄位，不應整段覆蓋現有 easyInno。

6.8 Idempotency

重複執行：

npx easy-inno init

不得產生重複內容。

如果設定完整：

easy-inno is already initialized.

✓ package:win script exists
✓ easyInno configuration exists
✓ .easy-inno/ is ignored

No changes were made.

6.9 修改後的 package.json
{
"name": "my-node-app",
"productName": "My Node App",
"version": "1.0.0",
"description": "My Node application",
"author": "Benjamin",
"license": "MIT",
"main": "dist/index.js",
"scripts": {
"build": "tsc",
"start": "node dist/index.js",
"preview": "npm run build && npm run start",
"package:win": "easy-inno build"
},
"easyInno": {
"entry": "dist/index.js",
"applicationType": "console",
"installer": {
"outputDirectory": "release",
"installMode": "perUser",
"startMenuShortcut": true,
"desktopShortcut": false,
"launchAfterInstall": true
}
}
}

6.10 .gitignore

加入：

# easy-inno

.easy-inno/
release/

如果 release/ 已由使用者明確放入版本控制，不能自動覆蓋其決定。init 可以只加入：

.easy-inno/

並詢問是否忽略 output directory。

7. easyInno 設定 Schema

完整設定：

{
"easyInno": {
"entry": "dist/index.js",
"applicationType": "console",

    "build": {
      "command": "npm run build",
      "dependencyCommand": "npm ci --omit=dev",
      "include": [
        "dist/**/*",
        "assets/**/*",
        "config/**/*",
        "package.json",
        "package-lock.json"
      ],
      "exclude": [
        "**/*.map",
        "**/*.test.js",
        "**/*.spec.js"
      ]
    },

    "runtime": {
      "version": "26.13.0",
      "architecture": "x64",
      "nodeArguments": [],
      "applicationArguments": [],
      "environment": {
        "NODE_ENV": "production"
      }
    },

    "launcher": {
      "workingDirectory": "app",
      "forwardArguments": true,
      "waitForExit": true,
      "showConsole": true
    },

    "installer": {
      "appId": "com.example.my-node-app",
      "outputDirectory": "release",
      "outputName": "${name}-Setup-${version}",
      "installMode": "perUser",
      "icon": "assets/app.ico",
      "startMenuShortcut": true,
      "desktopShortcut": false,
      "launchAfterInstall": true,
      "allowChangeInstallDirectory": true,
      "compression": "lzma2",
      "solidCompression": true
    },

    "advanced": {
      "keepStaging": false,
      "keepIss": false,
      "additionalInnoDirectives": {}
    }

}
}

8. 設定預設值
   const defaults = {
   entry: packageJson.main,

applicationType: "console",

build: {
command: packageJson.scripts?.build
? "npm run build"
: null,

    dependencyCommand: "npm ci --omit=dev",

    include: [
      "dist/**/*",
      "assets/**/*",
      "config/**/*",
      "package.json",
      "package-lock.json"
    ],

    exclude: [
      "**/*.map",
      "**/*.test.*",
      "**/*.spec.*"
    ]

},

runtime: {
version: "26.13.0",
architecture: "x64",
nodeArguments: [],
applicationArguments: [],
environment: {
NODE_ENV: "production"
}
},

launcher: {
workingDirectory: "app",
forwardArguments: true,
waitForExit: true,
showConsole: true
},

installer: {
outputDirectory: "release",
outputName: "${name}-Setup-${version}",
installMode: "perUser",
startMenuShortcut: true,
desktopShortcut: false,
launchAfterInstall: true,
allowChangeInstallDirectory: true,
compression: "lzma2",
solidCompression: true
},

advanced: {
keepStaging: false,
keepIss: false
}
};

runtime.version 和 runtime.architecture 在 v1 中只作為資訊與驗證欄位，不允許改成其他版本。

如果使用者設定：

{
"runtime": {
"version": "24.0.0"
}
}

應返回：

EASY_INNO_UNSUPPORTED_RUNTIME

easy-inno v1 only includes Node.js 26.13.0 x64.

Configured:
Node.js 24.0.0

Supported:
Node.js 26.13.0 x64

9. easy-inno build
   9.1 執行方式
   npx easy-inno build

或：

npm run package:win

9.2 Build Pipeline

1. Validate operating system
2. Load package.json
3. Resolve effective configuration
4. Validate project
5. Run project build command
6. Create staging directory
7. Copy application files
8. Install production dependencies
9. Copy bundled Node.js 26.13.0 runtime
10. Copy launcher.exe
11. Generate launcher configuration
12. Generate staging manifest
13. Generate Inno Setup script
14. Execute bundled ISCC.exe
15. Verify Setup.exe exists
16. Write build report
17. Clean temporary files

9.3 Build 目錄
.easy-inno/
├─ staging/
│ ├─ MyNodeApp.exe
│ ├─ easy-inno.runtime.json
│ ├─ runtime/
│ │ ├─ node.exe
│ │ ├─ npm
│ │ ├─ npm.cmd
│ │ ├─ npx
│ │ ├─ npx.cmd
│ │ ├─ LICENSE
│ │ └─ node_modules/
│ │ └─ npm/
│ └─ app/
│ ├─ package.json
│ ├─ package-lock.json
│ ├─ dist/
│ ├─ assets/
│ ├─ config/
│ └─ node_modules/
├─ generated/
│ └─ setup.iss
├─ manifests/
│ └─ staging-manifest.json
└─ logs/
├─ build.log
├─ dependencies.log
└─ inno.log

9.4 最終安裝目錄

Per-user：

%LOCALAPPDATA%\Programs\MyNodeApp\

Per-machine：

%ProgramFiles%\MyNodeApp\

安裝後結構：

MyNodeApp/
├─ MyNodeApp.exe
├─ easy-inno.runtime.json
├─ runtime/
│ └─ node.exe
└─ app/
├─ package.json
├─ dist/
├─ assets/
├─ config/
└─ node_modules/

10. Project Build 行為

如果存在：

{
"scripts": {
"build": "tsc"
}
}

執行：

npm run build

如果不存在 scripts.build：

不自動報錯
假設專案不需要編譯
直接驗證 production entry

可以手動停用：

{
"easyInno": {
"build": {
"command": null
}
}
}

或自訂：

{
"easyInno": {
"build": {
"command": "npm run build:production"
}
}
}

Build command 返回非零 exit code 時，立即停止。

11. Production Dependencies
    11.1 預設要求

必須存在：

package-lock.json

預設執行：

npm ci --omit=dev

執行位置：

.easy-inno\staging\app

11.2 缺少 lockfile
EASY_INNO_LOCKFILE_REQUIRED

package-lock.json was not found.

easy-inno uses "npm ci --omit=dev" to create a reproducible
production dependency tree.

Run:
npm install

Then commit package-lock.json and try again.

11.3 不使用 --ignore-scripts

預設：

npm ci --omit=dev

而不是：

npm ci --omit=dev --ignore-scripts

原因是 native package 可能需要 install script，例如：

better-sqlite3
sharp
serialport
bcrypt
canvas
11.4 Native module 相容性

Runtime 固定為 Node.js 26.13.0，因此 native dependency 必須支援該 Node ABI。

doctor 和 build 應檢查：

Host platform: win32
Host architecture: x64
Bundled runtime: Node.js 26.13.0 x64

production dependencies 必須在 Windows x64 環境建立。

12. 內置 Node.js Runtime
    12.1 Runtime 來源

使用官方：

node-v26.13.0-win-x64.zip

不要使用 MSI，因為 easy-inno 不需要在 build 或目標電腦上執行 Node installer。

官方 release page 同時提供 Windows x64 MSI、ZIP 和單獨的 node.exe，而完整 ZIP 更適合攜帶 npm、license 及完整發行內容。

12.2 SHA-256
dcc60d59a0746999f99064a01c020445d54d84228c691cdbf25b49ac3b59150a

Build easy-inno npm package 的 release pipeline 必須驗證此 checksum。

12.3 npm package 內部位置
vendor/
└─ node/
└─ win-x64/
└─ 26.13.0/
├─ node.exe
├─ npm
├─ npm.cmd
├─ npx
├─ npx.cmd
├─ LICENSE
└─ node_modules/
└─ npm/

12.4 Runtime 完整性驗證

每次 easy-inno build 前至少驗證：

vendor/node/win-x64/26.13.0/node.exe exists
vendor/node/win-x64/26.13.0/LICENSE exists

npm package release pipeline則驗證整個 archive checksum。

Node.js 授權允許使用、修改及分發，但要求在 copies 或 substantial portions 中保留 copyright notice 和 permission notice，因此安裝內容應保留 Node.js LICENSE。

13. Launcher 規格
    13.1 必要性

不能直接把捷徑指向：

runtime\node.exe app\dist\index.js

否則會造成：

捷徑顯示 Node.js icon
工作管理員顯示 node.exe
working directory 不一致
參數處理困難
GUI 程式彈出 console
無法統一注入環境變數

因此 easy-inno 應內置兩個預編譯 launcher：

launcher-console.exe
launcher-windowed.exe

使用者不需要安裝 C、C++、Go、Rust 或 .NET SDK。

13.2 Launcher 選擇
{
"easyInno": {
"applicationType": "console"
}
}

使用：

launcher-console.exe

{
"easyInno": {
"applicationType": "windowed"
}
}

使用：

launcher-windowed.exe

13.3 Runtime Config
{
"schemaVersion": 1,
"runtime": "runtime/node.exe",
"entry": "app/dist/index.js",
"workingDirectory": "app",
"nodeArguments": [],
"applicationArguments": [],
"forwardArguments": true,
"waitForExit": true,
"environment": {
"NODE_ENV": "production"
}
}

13.4 Launcher 行為

Launcher 必須：

取得自身 .exe 的絕對路徑
取得安裝目錄
讀取 easy-inno.runtime.json
驗證 runtime 存在
驗證 entry 存在
設定 working directory
注入環境變數
啟動 runtime\node.exe
傳入 entry 和 arguments
視設定等待 child process
返回 child exit code

實際啟動：

"<install-dir>\runtime\node.exe"
"<install-dir>\app\dist\index.js"

13.5 自動環境變數

Launcher 應加入：

EASY_INNO_INSTALL_DIR
EASY_INNO_APP_DIR
EASY_INNO_RUNTIME_DIR
EASY_INNO_DATA_DIR
EASY_INNO_APP_VERSION

例如：

EASY_INNO_INSTALL_DIR=C:\Users\Benjamin\AppData\Local\Programs\MyNodeApp
EASY_INNO_APP_DIR=C:\Users\Benjamin\AppData\Local\Programs\MyNodeApp\app
EASY_INNO_RUNTIME_DIR=C:\Users\Benjamin\AppData\Local\Programs\MyNodeApp\runtime
EASY_INNO_DATA_DIR=C:\Users\Benjamin\AppData\Local\MyNodeApp
EASY_INNO_APP_VERSION=1.0.0

14. 檔案收集策略
    14.1 不直接複製整個 repository

以下內容預設不得進入 installer：

.git/
.github/
.vscode/
.idea/
.easy-inno/
release/
node_modules/
coverage/
tests/
test/
\*.log
.env

14.2 預設包含
dist/**/\*
assets/**/_
config/\*\*/_
package.json
package-lock.json

14.3 自訂 include
{
"easyInno": {
"build": {
"include": [
"dist/**/*",
"public/**/*",
"templates/**/*",
"prisma/**/*",
"package.json",
"package-lock.json"
]
}
}
}

14.4 自訂 exclude
{
"easyInno": {
"build": {
"exclude": [
"**/*.map",
"**/*.test.js",
"dist/debug/**"
]
}
}
}

14.5 安全路徑限制

禁止 include：

../
C:\
\\server\share

所有來源必須位於專案根目錄內，避免意外把整個磁碟或秘密檔案加入 installer。

15. .env 處理

預設排除：

.env
.env.local
.env.development
.env.production

如果使用者明確需要：

{
"easyInno": {
"build": {
"include": [
".env.production"
]
}
}
}

easy-inno 應顯示警告：

WARNING: Environment file included

.env.production will be stored inside the installer and may be
read by anyone who can access or extract the installer.

Do not include passwords, private API keys or access tokens.

16. Inno Setup 整合
    16.1 內置位置
    vendor/
    └─ inno-setup/
    ├─ ISCC.exe
    ├─ ISCmplr.dll
    ├─ Setup.e32
    ├─ SetupLdr.e32
    ├─ Default.isl
    ├─ Languages/
    └─ LICENSE.txt

16.2 呼叫方式
vendor\inno-setup\ISCC.exe
/Qp
.easy-inno\generated\setup.iss

只能使用套件內置 ISCC.exe。

不得：

搜尋 PATH
使用 Registry 中的 Inno Setup
使用使用者另外安裝的版本
自動下載 Inno Setup
16.3 授權要求

Inno Setup 的官方 license 允許使用、修改和重新分發，包括 binary redistribution，但 binary form 必須保留現有 copyright notice 和網站地址，亦不得聲稱 easy-inno 是 Inno Setup 原作者。若修改 Inno Setup binary，還必須清楚標記為 modified version。

因此 npm package 必須包含：

vendor/inno-setup/LICENSE.txt
THIRD_PARTY_NOTICES.md

THIRD_PARTY_NOTICES.md 應列出：

Inno Setup
Copyright (C) Jordan Russell and Martijn Laan
https://jrsoftware.org/

Node.js
Copyright Node.js contributors
https://nodejs.org/

Inno Setup 7 的官方 revision history 現已列出 7.1 系列；正式 implementation 前應固定一個具體版本及其完整檔案清單，不應使用模糊的 latest。

17. Generated Inno Setup Script

範例：

#define AppName "My Node App"
#define AppVersion "1.0.0"
#define AppPublisher "Benjamin"
#define AppExeName "MyNodeApp.exe"

[Setup]
AppId={{com.example.my-node-app}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}

DefaultDirName={localappdata}\Programs\{#AppName}
DefaultGroupName={#AppName}

OutputDir=D:\Project\release
OutputBaseFilename=MyNodeApp-Setup-1.0.0

ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

PrivilegesRequired=lowest
Compression=lzma2
SolidCompression=yes

UninstallDisplayIcon={app}\{#AppExeName}
SetupIconFile=D:\Project\assets\app.ico

WizardStyle=modern
CloseApplications=yes
RestartApplications=no

[Files]
Source: "D:\Project\.easy-inno\staging\*"; \
 DestDir: "{app}"; \
 Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; \
 Filename: "{app}\{#AppExeName}"; \
 WorkingDir: "{app}\app"

Name: "{autodesktop}\{#AppName}"; \
 Filename: "{app}\{#AppExeName}"; \
 WorkingDir: "{app}\app"; \
 Tasks: desktopicon

[Tasks]
Name: "desktopicon"; \
 Description: "Create a desktop shortcut"; \
 Flags: unchecked

[Run]
Filename: "{app}\{#AppExeName}"; \
 Description: "Launch {#AppName}"; \
 WorkingDir: "{app}\app"; \
 Flags: nowait postinstall skipifsilent

注意 AppId 的實際生成需要正確處理 Inno Setup 的 brace escaping，不應直接以不完整模板拼接。

18. AppId 穩定性

同一應用的所有版本必須使用相同 AppId，否則：

1.0.0
1.1.0

會被 Windows 視為兩個不同應用。

init 應產生並保存：

{
"easyInno": {
"installer": {
"appId": "com.benjamin.my-node-app"
}
}
}

若無法根據 publisher 建立 reverse-domain，可生成 UUID：

{
"appId": "2f22b56c-b97d-4f67-9817-7ca4c42d607d"
}

此值一經建立，不得自動變更。

19. easy-inno doctor
    npx easy-inno doctor

輸出：

easy-inno doctor

Environment
✓ Windows x64
✓ Host Node.js detected
✓ npm available

Project
✓ package.json is valid
✓ package-lock.json exists
✓ Build script: npm run build
✓ Entry: dist/index.js
✓ Preview script exists

Bundled runtime
✓ Node.js 26.13.0 LTS x64
✓ node.exe exists
✓ Runtime license exists

Inno Setup
✓ ISCC.exe exists
✓ Inno Setup license exists

Installer
✓ AppId is stable
✓ Output directory is writable
✓ Icon is valid

Warnings
! Preview uses Node.js 27.0.0, installer uses Node.js 26.13.0
! Project contains native dependency: better-sqlite3

如果本機 npm run preview 使用的 Node major 不等於 26，必須警告：

Preview runtime mismatch

Local preview:
Node.js 27.0.0

Packaged runtime:
Node.js 26.13.0

For the closest preview parity, run the project locally with
Node.js 26.13.0.

20. easy-inno config
    npx easy-inno config

顯示解析後的有效設定：

Application
Name: My Node App
Version: 1.0.0
Publisher: Benjamin
Entry: dist/index.js
Type: console

Build
Command: npm run build
Dependencies: npm ci --omit=dev

Runtime
Node.js: 26.13.0 LTS
Platform: Windows
Architecture: x64
NODE_ENV: production

Installer
AppId: com.benjamin.my-node-app
Mode: per-user
Output: release/MyNodeApp-Setup-1.0.0.exe
Start Menu shortcut: yes
Desktop shortcut: no
Launch after install: yes

支援 JSON：

npx easy-inno config --json

21. easy-inno clean
    npx easy-inno clean

只刪除：

.easy-inno/

預設不刪除：

release/

完整刪除：

npx easy-inno clean --all

才會刪除 output directory。

22. Build 輸出

成功：

easy-inno v0.1.0

Application
My Node App 1.0.0

Runtime
Node.js 26.13.0 LTS x64

✓ Configuration validated
✓ Project build completed
✓ Application files collected
✓ Production dependencies installed
✓ Node.js runtime copied
✓ Launcher configured
✓ Inno Setup script generated
✓ Installer compiled

Installer created:

D:\Projects\my-node-app\release\MyNodeApp-Setup-1.0.0.exe

Size: 148.7 MB
Duration: 42.4 seconds

失敗時：

easy-inno build failed

EASY_INNO_ENTRY_NOT_FOUND

Production entry does not exist:

D:\Projects\my-node-app\dist\index.js

Configured by:
package.json > easyInno.entry

Run the project build first or correct easyInno.entry.

23. 錯誤代碼
    EASY_INNO_NOT_WINDOWS
    EASY_INNO_UNSUPPORTED_ARCH
    EASY_INNO_PACKAGE_NOT_FOUND
    EASY_INNO_INVALID_PACKAGE_JSON
    EASY_INNO_ALREADY_INITIALIZED
    EASY_INNO_ENTRY_REQUIRED
    EASY_INNO_ENTRY_NOT_FOUND
    EASY_INNO_BUILD_FAILED
    EASY_INNO_LOCKFILE_REQUIRED
    EASY_INNO_DEPENDENCY_INSTALL_FAILED
    EASY_INNO_RUNTIME_MISSING
    EASY_INNO_RUNTIME_MISMATCH
    EASY_INNO_LAUNCHER_MISSING
    EASY_INNO_ICON_INVALID
    EASY_INNO_OUTPUT_NOT_WRITABLE
    EASY_INNO_INNO_COMPILER_MISSING
    EASY_INNO_INNO_COMPILE_FAILED
    EASY_INNO_INSTALLER_NOT_CREATED
    EASY_INNO_PATH_OUTSIDE_PROJECT
    EASY_INNO_UNSUPPORTED_RUNTIME

所有錯誤必須包含：

error code
問題描述
相關路徑或設定來源
可執行的修復建議
非零 process exit code 24. 安裝與升級
24.1 Per-user
{
"installMode": "perUser"
}

安裝到：

%LOCALAPPDATA%\Programs\<AppName>

不要求 UAC。

24.2 Per-machine
{
"installMode": "perMachine"
}

安裝到：

%ProgramFiles%\<AppName>

要求 UAC。

24.3 升級

相同 AppId：

1.0.0 → 1.1.0

必須覆蓋現有程式檔案，不建立第二個獨立應用。

24.4 User data

應用資料不得預設寫入安裝目錄。

建議位置：

%LOCALAPPDATA%\<AppName>

Launcher 提供：

EASY_INNO_DATA_DIR

解除安裝時，預設保留 user data。

未來可加入：

{
"installer": {
"removeUserDataOnUninstall": false
}
}

但 MVP 不應自動刪除 user data。

25. 安全要求
    25.1 路徑防護

所有操作必須阻止：

../ traversal
Junction escape
Symlink escape
輸出目錄指向磁碟根目錄
刪除 project root
刪除 user profile
include 專案外檔案
25.2 Child process

禁止：

exec(`"${path}" ${userInput}`);

應使用：

spawn(executable, args, {
shell: false
});

避免 shell injection。

25.3 Secrets

Build log 不得輸出：

完整環境變數
npm token
Registry password
.npmrc credentials
API keys

.npmrc 不得被複製到 installer。

25.4 Code signing

MVP 不自動簽章。

未簽章 installer 可能觸發 Windows SmartScreen。此情況應在文件中說明，但不可將其錯誤描述成 easy-inno build failure。

26. npm Package 結構
    easy-inno/
    ├─ package.json
    ├─ README.md
    ├─ LICENSE
    ├─ THIRD_PARTY_NOTICES.md
    ├─ bin/
    │ └─ easy-inno.js
    ├─ dist/
    │ ├─ cli.js
    │ ├─ index.js
    │ ├─ commands/
    │ │ ├─ init.js
    │ │ ├─ build.js
    │ │ ├─ doctor.js
    │ │ ├─ config.js
    │ │ └─ clean.js
    │ ├─ config/
    │ │ ├─ schema.js
    │ │ ├─ defaults.js
    │ │ └─ resolver.js
    │ ├─ build/
    │ │ ├─ project-builder.js
    │ │ ├─ collector.js
    │ │ ├─ dependencies.js
    │ │ ├─ runtime.js
    │ │ ├─ staging.js
    │ │ └─ manifest.js
    │ ├─ inno/
    │ │ ├─ generator.js
    │ │ ├─ compiler.js
    │ │ └─ escape.js
    │ └─ utils/
    │ ├─ filesystem.js
    │ ├─ process.js
    │ ├─ logger.js
    │ └─ errors.js
    ├─ templates/
    │ └─ setup.iss.hbs
    └─ vendor/
    ├─ node/
    │ └─ win-x64/
    │ └─ 26.13.0/
    ├─ inno-setup/
    └─ launcher/
    ├─ launcher-console.exe
    └─ launcher-windowed.exe

27. easy-inno 自身的 package.json
    {
    "name": "easy-inno",
    "version": "0.1.0",
    "description": "Zero-setup Windows installer builder for Node.js applications",
    "type": "module",
    "bin": {
    "easy-inno": "./bin/easy-inno.js"
    },
    "files": [
    "bin",
    "dist",
    "templates",
    "vendor",
    "README.md",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md"
    ],
    "os": [
    "win32"
    ],
    "cpu": [
    "x64"
    ],
    "engines": {
    "node": ">=20"
    },
    "keywords": [
    "windows",
    "installer",
    "inno-setup",
    "nodejs",
    "packaging",
    "setup"
    ]
    }

engines.node 表示執行 easy-inno CLI 的最低 host Node.js，不代表 installer 的 Runtime。Installer 永遠使用 Node.js 26.13.0 x64。

28. 建議技術依賴
    {
    "dependencies": {
    "commander": "^14.0.0",
    "zod": "^4.0.0",
    "execa": "^9.0.0",
    "fast-glob": "^3.3.0",
    "fs-extra": "^11.0.0",
    "handlebars": "^4.7.0",
    "picocolors": "^1.1.0",
    "ora": "^8.0.0",
    "@inquirer/prompts": "^7.0.0",
    "jsonc-parser": "^3.0.0"
    }
    }

用途：

Library 用途commander CLI commands
zod easyInno schema validation
execa 執行 npm 和 ISCC
fast-glob include/exclude
fs-extra staging file operations
handlebars .iss template
picocolors CLI output
ora progress spinner
@inquirer/prompts init 互動
jsonc-parser 儘量保留 package.json formatting 29. 測試規格
29.1 Unit Tests
package metadata resolution
entry inference
config merging
default values
environment variable validation
output name interpolation
Inno string escaping
Windows path escaping
traversal prevention
error formatting
idempotent init
29.2 Integration Tests

測試專案：

fixtures/
├─ commonjs-basic/
├─ esm-basic/
├─ typescript-cli/
├─ express-server/
├─ assets-and-config/
├─ native-better-sqlite3/
├─ chinese-path/
└─ space-in-path/

29.3 Windows CI

GitHub Actions：

runs-on: windows-latest

測試：

npm ci
npm run build
npm test
npx easy-inno init --yes
npx easy-inno doctor
npx easy-inno build

29.4 安裝測試

CI 應執行：

Setup.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART

然後：

InstalledApp.exe --easy-inno-health-check

最後靜默解除安裝。

30. MVP 驗收標準

easy-inno v0.1.0 必須滿足：

Windows x64 電腦沒有安裝 Inno Setup，仍能 build。
npm package 直接包含 Inno Setup compiler。
npm package 直接包含 Node.js 26.13.0 LTS x64 Runtime。
目標電腦沒有 Node.js，應用仍能啟動。
目標電腦沒有 npm，應用仍能啟動。
目標電腦沒有網絡，仍能安裝和啟動。
init 直接修改 package.json。
init 不建立第二份 config。
init 可重複執行且不破壞現有設定。
build 使用固定的內置 Runtime。
build 使用固定的內置 ISCC.exe。
build 不搜尋系統 PATH 的 Inno Setup。
npm run preview 和安裝後使用相同 production entry。
支援 CommonJS。
支援 ES Modules。
支援 TypeScript 編譯結果。
支援 production dependencies。
能打包至少一個 native dependency 測試專案。
路徑含空格時正常。
路徑和 Windows 使用者名稱含中文時正常。
installer 可建立開始功能表捷徑。
installer 可選擇建立桌面捷徑。
installer 可正常解除安裝。
相同 AppId 的新版可以升級舊版。
build failure 返回非零 exit code。
Node.js 與 Inno Setup license 均包含在 npm package。
不把 .npmrc、.git、.env 預設放入 installer。
不要求使用者安裝任何額外 build tool。31. 開發階段
Phase 1：CLI 和設定
建立 TypeScript 專案
CLI command routing
init
package.json 修改
config schema
doctor
config
error system
Phase 2：Staging Builder
執行 project build
file collector
npm ci --omit=dev
複製 Node.js 26.13.0 Runtime
runtime config
staging manifest
Phase 3：Launcher
console launcher
windowed launcher
argument forwarding
working directory
environment variables
Unicode path support
child exit code forwarding
Phase 4：Inno Setup
ISS generator
Inno escaping
per-user/per-machine
shortcuts
upgrade
uninstall
ISCC runner
log capture
Phase 5：測試和發布
fixture projects
Windows CI
silent install test
uninstall test
native dependency test
license audit
npm package content audit
checksum verification 32. 最終使用範例
安裝
npm install --save-dev easy-inno

初始化
npx easy-inno init

本機 production preview
npm run preview

建構 installer
npm run package:win

或者：

npx easy-inno build

輸出
release/
└─ MyNodeApp-Setup-1.0.0.exe

安裝後
%LOCALAPPDATA%\Programs\MyNodeApp\
├─ MyNodeApp.exe
├─ runtime\
│ └─ node.exe
└─ app\
 ├─ dist\
 └─ node_modules\

最終產品定義

easy-inno 不是單純的 ISCC.exe wrapper，也不是把 JavaScript 壓縮成單一 EXE 的工具。

它的正式定義應是：

一個 Windows x64 專用、內置 Node.js 26.13.0 LTS Runtime 和 Inno Setup compiler 的 zero-setup npm packaging tool。它從 package.json 取得應用程式及 installer 設定，收集 production build、dependencies 和 assets，最後產生可以在沒有 Node.js 的 Windows 電腦上安裝和運行的單一 Setup.exe。

這份規格的主要設計改進，是將設定統一放在 package.json、把 init 定義為安全且可重複執行的初始化工具，並固定 Runtime 版本以確保不同電腦和 CI 產生一致的安裝結果。
