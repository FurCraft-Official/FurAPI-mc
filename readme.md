# Minecraft 服务器状态查询 API

一个高性能、功能丰富的 Minecraft 服务器状态查询 API，支持 Java 版和基岩版服务器。

## ✨ 特性

- 🚀 **多版本支持** - 支持 Java 版和基岩版 Minecraft 服务器
- 🔍 **灵活查询** - 支持预配置服务器名称查询和直接 IP:Port 查询
- 💾 **智能缓存** - 内置缓存机制，减少重复查询，提高响应速度
- 🛡️ **安全防护** - 内置速率限制和管理员权限验证
- 📊 **详细日志** - 完整的请求日志和错误追踪
- 🌐 **SRV 记录支持** - 支持 Minecraft SRV DNS 记录解析
- 🔧 **易于配置** - 简单的配置文件管理
- 📱 **CORS 支持** - 支持跨域请求，便于前端集成
- 🔒 **HTTPS 支持** - 可选的 HTTPS 安全连接

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 启动服务

```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

### Docker 部署

```bash
# 构建镜像
docker build -t mc-status-api .

# 运行容器
docker run -p 3000:3000 mc-status-api
```

## 📖 API 文档

### 基础信息

- **基础URL**: `http://localhost:3000`
- **数据格式**: JSON
- **字符编码**: UTF-8

### 🔍 查询端点

#### 1. 获取所有预配置服务器列表

```http
GET /api/servers
```

**响应示例**:
```json
{
  "servers": [
    {
      "name": "hypixel",
      "type": "java",
      "isSrv": false,
      "address": "mc.hypixel.net",
      "port": 25565
    }
  ]
}
```

#### 2. 查询单个预配置服务器状态

```http
GET /api/stats/{serverName}
```

**参数说明**:
- `serverName`: 在 `config/servers.txt` 中配置的服务器名称

**响应示例**:
```json
{
  "name": "hypixel",
  "online": true,
  "type": "java",
  "version": "1.8.x-1.20.x",
  "players": {
    "online": 45231,
    "max": 200000
  },
  "ping": 45,
  "timestamp": 1703123456789,
  "motd": "Hypixel Network [1.8-1.20]",
  "icon": "data:image/png;base64,..."
}
```

#### 3. 🆕 直接查询 IP:Port 服务器状态

```http
GET /api/stats/direct/{ip:port}
GET /api/stats/direct/{ip:port:type}
```

**支持格式**:
- `127.0.0.1:25565` - Java版服务器（默认）
- `192.168.1.100:19132:bedrock` - 基岩版服务器
- `[2001:db8::1]:25565:java` - IPv6地址
- `example.com:25566:java` - 域名+端口

**示例请求**:
```bash
# Java版服务器
curl "http://localhost:3000/api/stats/direct/mc.hypixel.net:25565"

# 基岩版服务器
curl "http://localhost:3000/api/stats/direct/mco.mineplex.com:19132:bedrock"

# IPv6地址
curl "http://localhost:3000/api/stats/direct/[2001:db8::1]:25565"
```

**响应示例**:
```json
{
  "name": "127.0.0.1:25565",
  "address": "127.0.0.1",
  "port": 25565,
  "online": true,
  "type": "java",
  "version": "1.20.1",
  "players": {
    "online": 5,
    "max": 20
  },
  "ping": 23,
  "timestamp": 1703123456789,
  "motd": "A Minecraft Server",
  "icon": null
}
```

#### 4. 查询所有预配置服务器状态

```http
GET /api/stats
```

**响应示例**:
```json
{
  "hypixel": {
    "name": "hypixel",
    "online": true,
    "type": "java",
    "players": { "online": 45231, "max": 200000 },
    "ping": 45
  },
  "local-server": {
    "name": "local-server",
    "online": false,
    "error": "连接超时",
    "timestamp": 1703123456789
  }
}
```

### 🛠️ 管理端点

> 需要在环境变量中设置 `ADMIN_TOKEN`

#### 清除缓存

```http
POST /api/admin/cache/clear?token={ADMIN_TOKEN}
```

#### 重新加载配置

```http
POST /api/admin/reload?token={ADMIN_TOKEN}
```

### 🏥 健康检查

```http
GET /health
```

## ⚙️ 配置文件

### 主配置文件 (`config/config.json`)

```json
{
  "listenIP": "0.0.0.0",
  "http": {
    "port": 3000
  },
  "https": {
    "enabled": false,
    "port": 3443,
    "keyPath": "./ssl/private.key",
    "certPath": "./ssl/certificate.crt"
  },
  "staticDir": "./public",
  "cache": {
    "enabled": true,
    "ttl": 60000
  },
  "rateLimit": {
    "enabled": true,
    "windowMs": 60000,
    "max": 100
  },
  "logging": {
    "level": "info",
    "console": true,
    "file": "./logs/api.log",
    "colors": true,
    "timestamp": true,
    "maxFileSize": 10485760
  }
}
```

### 服务器配置文件 (`config/servers.txt`)

```bash
# Minecraft 服务器配置文件
# 格式: 服务器名称=地址:端口:类型:是否SRV记录
# 端口: Java版默认25565，基岩版默认19132
# 类型: java(默认) 或 bedrock
# SRV记录: true 或 false(默认)

# Java版服务器
hypixel=mc.hypixel.net:25565:java:false
mineplex=us.mineplex.com:25565:java:false

# 基岩版服务器
bedrock-server=mco.mineplex.com:19132:bedrock:false

# 使用SRV记录的服务器
srv-example=_minecraft._tcp.example.com:25565:java:true

# 本地服务器
local-java=localhost:25565:java:false
local-bedrock=localhost:19132:bedrock:false
```

### 环境变量 (`.env`)

```bash
# 管理员令牌（用于管理接口）
ADMIN_TOKEN=your_secret_admin_token_here

# 可选：数据库连接等其他配置
# DATABASE_URL=mongodb://localhost:27017/mcstatus
```

## 🏗️ 项目结构

```
FurAPI-mc/
├── app.js              # 主应用文件
├── init.js             # 初始化脚本
├── log.js              # 日志管理器
├── web.js              # Web服务器模块
├── package.json        # 项目依赖配置
├── config/             # 配置文件目录
│   ├── config.json     # 主配置文件
│   └── servers.txt     # 服务器列表配置
├── logs/               # 日志文件目录
├── ssl/                # SSL证书目录
├── public/             # 静态文件目录
└── dist/               # 编译输出目录
```

## 🛠️ 构建和部署

### 开发模式

```bash
npm run dev
```

### 构建可执行文件

```bash
# 构建所有平台
npm run build:all

# 构建特定平台
npm run build:win      # Windows x64
npm run build:linux    # Linux x64
npm run build:mac      # macOS x64
```

### Docker 部署

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000
CMD ["npm", "start"]
```

## 📊 监控和日志

### 日志级别

- `debug`: 详细调试信息
- `info`: 一般信息记录
- `warn`: 警告信息
- `error`: 错误信息

### 日志格式

```
2024-01-01 12:00:00 INFO 192.168.1.100 /api/stats/hypixel 在线 45231/200000 [java] 45ms
```

## 🔧 故障排除

### 常见问题

#### 1. 服务器无法访问

**问题**: API 返回 `连接超时` 或 `连接被拒绝`

**解决方案**:
- 检查目标服务器是否在线
- 确认端口号是否正确
- 检查防火墙设置
- 验证网络连接

#### 2. SRV 记录解析失败

**问题**: SRV 记录服务器返回解析错误

**解决方案**:
- 确认 DNS 服务器可以访问
- 验证 SRV 记录格式是否正确
- 检查域名是否存在对应的 SRV 记录

#### 3. 速率限制触发

**问题**: 收到 `429 Too Many Requests` 错误

**解决方案**:
- 减少请求频率
- 调整配置文件中的速率限制参数
- 使用缓存来减少重复请求

### 调试模式

启用详细日志输出：

```json
{
  "logging": {
    "level": "debug"
  }
}
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 开发流程

1. Fork 本项目
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 📄 许可证

本项目基于 GPL-3.0 许可证开源 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

- [mc-ping-updated](https://www.npmjs.com/package/mc-ping-updated) - Java版服务器ping库
- [Express.js](https://expressjs.com/) - Web框架
- [Node.js](https://nodejs.org/) - JavaScript运行环境

## 📞 支持

如果你遇到任何问题或有建议，请：

1. 查看 [故障排除](#🔧-故障排除) 部分
2. 搜索现有的 [Issues](../../issues)
3. 创建新的 Issue 并提供详细信息

---

⭐ 如果这个项目对你有帮助，请给个 Star 支持一下！