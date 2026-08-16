# Changelog

## 0.1.0 — 未发布

骨架里程碑(不含正式功能):

- 可安装的 DSH out-of-tree bundle:`dsh.bundle`(cordis.patch.yml 插入 Host 行)+ `dsh.client`(platform web)。
- Host 半:仅一个生命周期标记 effect(激活/卸载日志),无用量观测、无存储、无路由。
- Client 半:向 `shell.overlay` 注册一个占位圆点(悬停/聚焦文案 `今日梁位`),无正式 UI。
- 分层:`shared` / `domain`(占位) / `host` / `client` / `compat/dsh`(唯一直接触碰 DSH API 的层)。
- 浏览器产物复刻树内 `clientBundle` preset 的 `window.__ModuleLoader__.load` 包装(基线 47f94385)。
- 开发环:typecheck / lint / test / build / dev profile 安装 / dump-config / WebUI 启动 / 卸载 / tarball / 干净 profile 冒烟脚本。
