const fs = require('fs');
const path = require('path');

// 获取基础路径（兼容 pkg 打包和开发环境）
const baseDir = process.pkg ? path.dirname(process.execPath) : __dirname;

// 获取当前日期和时间（格式：YYYY-MM-DD HH:mm:ss）
function getFormattedDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0'); // 月份从0开始
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 绿色文字输出函数
function greenLog(message, level = 'INFO') {
  const timestamp = getFormattedDate();
  console.log(`\x1b[32m${timestamp} ${level} ${message}\x1b[0m`);
}

// 增强版目录存在检测（防止符号链接问题）
function dirExists(dirPath) {
  try {
    const stat = fs.statSync(dirPath);
    return stat.isDirectory();
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err; // 其他错误重新抛出
  }
}

// 安全创建目录（带完整检测）
function ensureDir(dirPath) {
  if (dirExists(dirPath)) {
    greenLog(`目录已存在: ${path.relative(baseDir, dirPath)}`);
    return true;
  }

  try {
    fs.mkdirSync(dirPath, { recursive: true });
    greenLog(`创建成功: ${path.relative(baseDir, dirPath)}`);
    return true;
  } catch (err) {
    if (err.code === 'EEXIST') {
      // 处理竞争条件：可能其他进程已创建
      if (dirExists(dirPath)) {
        greenLog(`目录已存在: ${path.relative(baseDir, dirPath)}`);
        return true;
      }
    }
    console.error(`\x1b[31m${getFormattedDate()} ERROR 创建失败: ${dirPath}\n${err.message}\x1b[0m`);
    return false;
  }
}

// 安全写入文件（增强版检测）
function writeFileIfNotExists(filePath, content) {
  if (fs.existsSync(filePath)) {
    greenLog(`文件已存在: ${path.relative(baseDir, filePath)}`);
    return;
  }

  try {
    // 确保父目录存在
    const parentDir = path.dirname(filePath);
    if (!dirExists(parentDir)) {
      ensureDir(parentDir);
    }

    fs.writeFileSync(filePath, content);
    greenLog(`创建成功: ${path.relative(baseDir, filePath)}`);
  } catch (err) {
    console.error(`\x1b[31m${getFormattedDate()} ERROR 写入失败: ${filePath}\n${err.message}\x1b[0m`);
  }
}

// 需要创建的目录结构
const dirs = [
  path.join(baseDir, 'config'),
  path.join(baseDir, 'logs'),
  path.join(baseDir, 'ssl'),
  path.join(baseDir, 'public')
];

// 初始化函数
function initialize() {
  greenLog('正在初始化文件系统...');
  
  // 创建所有目录
  dirs.forEach(ensureDir);
  
  // 配置文件内容（保持不变）
  const configContent = JSON.stringify({
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
, null, 2);

  // 创建配置文件
  writeFileIfNotExists(
    path.join(baseDir, 'config/config.json'),
    configContent
  );
  
  writeFileIfNotExists(
    path.join(baseDir, 'config/servers.txt'),
    `# Minecraft 服务器配置文件
# 格式: 服务器名称=地址:端口:类型:是否SRV记录
# 端口: Java版默认25565，基岩版默认19132
# 类型: java(默认) 或 bedrock
# SRV记录: true 或 false(默认)
# 以#开头的行为注释

# Java版服务器
hypixel=mc.hypixel.net:25565:java:false
mineplex=us.mineplex.com:25565:java:false
furcraft=play.furcraft.top:25565:java:false
furmod=mod.furcraft.top:25565:java:false

# 基岩版服务器
bedrock-server=mco.mineplex.com:19132:bedrock:false
cubecraft-bedrock=mco.cubecraft.net:19132:bedrock:false

# 使用SRV记录的服务器
srv-example=_minecraft._tcp.example.com:25565:java:true

# 本地服务器
local-java=localhost:25565:java:false
local-bedrock=localhost:19132:bedrock:false
test-server=127.0.0.1:25566:java:false

# 其他服务器
example1=example.com:25565:java:false
example2=play.example.net:25567:java:false`
  );
  
  greenLog('文件系统初始化完成');
}

// 执行初始化
initialize();
