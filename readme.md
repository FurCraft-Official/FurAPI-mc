
一个用于获取 Minecraft 服务器状态的 Node.js API 服务，支持 Java 版和基岩版服务器。

## 功能特性

- 🔧 灵活的配置系统
- 💾 智能缓存机制
- 🛡️ 访问速率限制
- 🔒 HTTP/HTTPS 双协议支持
- 📊 多等级日志系统
- 🎯 简单的服务器配置格式
- ☕ Java 版服务器支持
- 🪨 基岩版服务器支持
- 🌐 SRV 记录解析支持
- 📁 模块化代码结构

## 项目结构

```
├── app.js          # 主程序入口
├── web.js          # Web服务器模块
├── log.js          # 日志模块
├── config.json     # 主配置文件
├── servers.txt     # 服务器配置文件
├── package.json    # 依赖配置
├# Minecraft 服务器状态 API

一个用于获取 Minecraft 服务器状态的 Node.js API 服务。

## 功能特性

- 🔧 灵活的配置系统
- 💾 智能缓存机制
- 🛡️ 访问速率限制
- 🔒 HTTP/HTTPS 双协议支持
- 📊 详细的访问日志
- 🎯 简单的服务器配置格式

## 安装和使用

### 1. 安装依赖

```bash
npm install
```

### 2. 配置文件

#### 主配置文件 (config.json)

```json
{
  "listenIP": "0.0.0.0",           // 监听IP地址
  "http": {
    "enabled": true,               // 是否启用HTTP
    "port": 3000                   // HTTP端口
  },
  "https": {
    "enabled": false,              // 是否启用HTTPS
    "port": 3443,                  // HTTPS端口
    "keyPath": "./ssl/private.key", // SSL私钥路径
    "certPath": "./ssl/certificate.crt" // SSL证书路径
  },
  "cache": {
    "enabled": true,               // 是否启用缓存
    "ttl": 60000                   // 缓存过期时间(毫秒)
  },
  "rateLimit": {
    "enabled": true,               // 是否启用速率限制
    "windowMs": 60000,             // 时间窗口(毫秒)
    "max": 100                     // 最大请求次数
  }
}
```

#### 服务器配置文件 (servers.txt)

```text
# 服务器配置文件
# 格式: 服务器名称=IP:端口
# 端口默认为25565，可以省略

hypixel=mc.hypixel.net
local=localhost:25565
test=127.0.0.1:25566
```

### 3. 启动服务

```bash
# 生产环境
npm start

# 开发环境 (需要先安装 nodemon)
npm run dev
```

## API 端点

### GET /health
健康检查端点

**响应示例:**
```json
{
  "status": "ok",
  "timestamp": "2025-08-18T10:30:00.000Z"
}
```

### GET /servers
获取所有配置的服务器列表

**响应示例:**
```json
{
  "servers": ["hypixel", "local", "test"]
}
```

### GET /status/:serverName
获取指定服务器状态

**响应示例 (在线):**
```json
{
  "server": "hypixel",
  "online": true,
  "version": {
    "name": "1.8.x-1.20.x",
    "protocol": 47
  },
  "players": {
    "online": 45623,
    "max": 200000
  },
  "description": "Hypixel Network",
  "favicon": "data:image/png;base64,...",
  "ping": 45,
  "timestamp": "2025-08-18T10:30:00.000Z"
}
```

**响应示例 (离线):**
```json
{
  "server": "offline-server",
  "online": false,
  "error": "connect ECONNREFUSED 127.0.0.1:25565",
  "timestamp": "2025-08-18T10:30:00.000Z"
}
```

### GET /status
获取所有服务器状态

**响应示例:**
```json
{
  "hypixel": {
    "server": "hypixel",
    "online": true,
    "version": { "name": "1.8.x-1.20.x", "protocol": 47 },
    "players": { "online": 45623, "max": 200000 },
    "description": "Hypixel Network",
    "ping": 45,
    "timestamp": "2025-08-18T10:30:00.000Z"
  },
  "local": {
    "server": "local",
    "online": false,
    "error": "connect ECONNREFUSED 127.0.0.1:25565",
    "timestamp": "2025-08-18T10:30:00.000Z"
  }
}
```

## 管理端点

### POST /admin/cache/clear
清除所有缓存

### POST /admin/reload
重新加载服务器配置文件

## 日志格式

日志输出格式: `日期时间 日志等级 客户端IP 访问资源 附加信息`

**示例:**
```
2025-08-18 10:30:15 INFO 192.168.1.100 /status/hypixel 在线 45623/200000
2025-08-18 10:30:16 WARN 192.168.1.101 /status/offline 离线 - connect ECONNREFUSED
2025-08-18 10:30:17 INFO 192.168.1.102 /status/hypixel 返回缓存数据
```

## 配置说明

### 主配置 (config.json)

- **listenIP**: 服务器监听的IP地址，使用 "0.0.0.0" 监听所有接口
- **http.enabled**: 是否启用HTTP服务
- **https.enabled**: 是否启用HTTPS服务，需要SSL证书
- **cache.enabled**: 是否启用响应缓存
- **cache.ttl**: 缓存生存时间，单位毫秒
- **rateLimit.enabled**: 是否启用访问速率限制
- **rateLimit.windowMs**: 速率限制时间窗口
- **rateLimit.max**: 时间窗口内最大请求次数

### 服务器配置 (servers.txt)

- 每行一个服务器配置
- 格式: `服务器名称=主机:端口`
- 端口可选，默认 25565
- 支持注释行 (以 # 开头)
- 支持空行

## 安全注意事项

1. 在生产环境中，建议：
   - 启用HTTPS
   - 设置适当的速率限制
   - 限制管理端点的访问权限
   - 使用反向代理 (如 Nginx)

2. SSL证书配置：
   - 将SSL证书放在 `./ssl/` 目录下
   - 私钥文件: `private.key`
   - 证书文件: `certificate.crt`

## 故障排除

1. **端口被占用**: 修改 config.json 中的端口配置
2. **SSL证书错误**: 检查证书路径和权限
3. **服务器无法连接**: 检查 servers.txt 中的服务器地址和端口
4. **缓存问题**: 使用 `/admin/cache/clear` 清除缓存

## 开发

如果需要添加新功能或修改现有功能，主要的代码逻辑在 `app.js` 文件中的 `MCStatusAPI` 类。