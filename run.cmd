@echo off
rem 一键启动「LX Music 自定义构建」界面（Windows）
rem 需先安装 Node.js 22+ 与 Git for Windows；首次运行会在 gui 里装 electron，之后直接启动
setlocal
cd /d "%~dp0gui"
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
if not exist "node_modules\electron" (
  echo 首次运行：安装依赖（含 electron，可能要几分钟）...
  call npm install || goto :err
)
call npm start
exit /b 0
:err
echo 安装失败，请确认已安装 Node.js 22+ 且网络可达。
exit /b 1
