require('./init.js');
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const minecraft = require('minecraft-protocol');
const dns = require('dns').promises;
const Logger = require('./log');
const WebServer = require('./web');

// 基岩版 ping 实现
class BedrockPing {
    static async ping(host, port = 19132, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const dgram = require('dgram');
            const client = dgram.createSocket('udp4');

            // 基岩版查询包
            const queryPacket = Buffer.from([
                0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0xff, 0xff, 0x00, 0xfe, 0xfe, 0xfe,
                0xfe, 0xfd, 0xfd, 0xfd, 0xfd, 0x12, 0x34, 0x56, 0x78
            ]);

            const timer = setTimeout(() => {
                client.close();
                reject(new Error('连接超时'));
            }, timeout);

            client.send(queryPacket, port, host, (err) => {
                if (err) {
                    clearTimeout(timer);
                    client.close();
                    reject(err);
                }
            });

            client.on('message', (msg) => {
                clearTimeout(timer);
                client.close();

                try {
                    const data = msg.toString('utf8').split(';');
                    if (data.length >= 6) {
                        resolve({
                            motd: data[1] || '',
                            protocol: parseInt(data[2]) || 0,
                            version: data[3] || '',
                            currentPlayers: parseInt(data[4]) || 0,
                            maxPlayers: parseInt(data[5]) || 0,
                            gamemode: data[8] || '',
                            serverId: data[0] || '',
                            icon: null
                        });
                    } else {
                        reject(new Error('无效的基岩版响应数据'));
                    }
                } catch (error) {
                    reject(new Error('解析基岩版响应失败'));
                }
            });

            client.on('error', (err) => {
                clearTimeout(timer);
                client.close();
                reject(err);
            });
        });
    }
}

// Java版 ping 实现（使用 minecraft-protocol）
class JavaPing {
    static async ping(host, port = 25565, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            // 使用 minecraft-protocol 的 ping 功能
            minecraft.ping({
                host: host,
                port: port,
                timeout: timeout
            }, (err, result) => {
                if (err) {
                    reject(err);
                    return;
                }

                const pingTime = Date.now() - startTime;
                
                try {
                    // 解析响应数据
                    let motd = 'No MOTD';
                    if (result.description) {
                        if (typeof result.description === 'string') {
                            motd = result.description;
                        } else if (result.description.text) {
                            motd = result.description.text;
                        } else if (result.description.translate) {
                            motd = result.description.translate;
                        }
                    }

                    resolve({
                        type: 'java',
                        version: result.version?.name || 'Unknown',
                        protocol: result.version?.protocol || 0,
                        players: {
                            online: result.players?.online || 0,
                            max: result.players?.max || 0
                        },
                        ping: result.latency || pingTime,
                        motd: motd,
                        icon: result.favicon || null,
                        modinfo: result.modinfo || null
                    });
                } catch (parseError) {
                    reject(new Error(`解析响应失败: ${parseError.message}`));
                }
            });
        });
    }
}

// 缓存管理器
class CacheManager {
    constructor(ttl = 60000) {
        this.cache = new Map();
        this.ttl = ttl;
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0
        };
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) {
            this.stats.misses++;
            return null;
        }

        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            this.stats.misses++;
            return null;
        }

        this.stats.hits++;
        return item.data;
    }

    set(key, data) {
        this.cache.set(key, {
            data,
            expiry: Date.now() + this.ttl
        });
        this.stats.sets++;
    }

    clear() {
        const size = this.cache.size;
        this.cache.clear();
        return size;
    }

    getStats() {
        return {
            ...this.stats,
            size: this.cache.size,
            hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0
        };
    }

    // 清理过期缓存项
    cleanup() {
        let cleaned = 0;
        for (const [key, item] of this.cache.entries()) {
            if (Date.now() > item.expiry) {
                this.cache.delete(key);
                cleaned++;
            }
        }
        return cleaned;
    }
}

// 服务器配置解析器
class ServerConfigParser {
    static parseConfig(configStr) {
        const parts = configStr.split(':');
        if (parts.length < 1) return null;

        const address = parts[0];
        const port = parseInt(parts[1]) || (parts[2] === 'bedrock' ? 19132 : 25565);
        const type = parts[2] || 'java';
        const isSrv = parts[3] === 'true';

        // 验证服务器类型
        if (!['java', 'bedrock'].includes(type)) {
            throw new Error(`不支持的服务器类型: ${type}`);
        }

        // 验证端口范围
        if (port < 1 || port > 65535) {
            throw new Error(`无效的端口号: ${port}`);
        }

        return { address, port, type, isSrv };
    }

    static parseIpPort(ipPortStr) {
        if (!ipPortStr || typeof ipPortStr !== 'string') {
            throw new Error('无效的IP:Port格式');
        }

        let host, port, type = 'java';
        const parts = ipPortStr.split(':');

        if (parts.length < 2) {
            throw new Error('缺少端口号');
        }

        if (parts.length === 2) {
            // 格式: ip:port
            host = parts[0];
            port = parseInt(parts[1]);
        } else if (parts.length === 3) {
            // 格式: ip:port:type 或 IPv6
            if (parts[2] === 'java' || parts[2] === 'bedrock') {
                host = parts[0];
                port = parseInt(parts[1]);
                type = parts[2];
            } else {
                // 可能是 IPv6 地址
                host = parts.slice(0, -1).join(':');
                port = parseInt(parts[parts.length - 1]);
            }
        } else {
            // 处理复杂的 IPv6 地址
            const lastPart = parts[parts.length - 1];
            const secondLastPart = parts[parts.length - 2];

            if (lastPart === 'java' || lastPart === 'bedrock') {
                type = lastPart;
                port = parseInt(secondLastPart);
                host = parts.slice(0, -2).join(':');
            } else {
                port = parseInt(lastPart);
                host = parts.slice(0, -1).join(':');
            }
        }

        // 验证端口号
        if (isNaN(port) || port < 1 || port > 65535) {
            throw new Error('无效的端口号');
        }

        // 验证主机名/IP
        if (!host || host.trim() === '') {
            throw new Error('无效的主机地址');
        }

        // 清理主机名（移除方括号如果是IPv6）
        host = host.replace(/^\[|\]$/g, '');

        return { address: host, port, type, isSrv: false };
    }
}

// 主应用类
class MCStatusAPI {
    constructor() {
        this.loadConfig();
        this.loadServers();
        this.logger = new Logger(this.config.logging);
        this.cache = new CacheManager(this.config.cache.ttl);
        this.webServer = new WebServer(this.config, this.logger);
        this.setupRoutes();
        this.setupCleanupTasks();
    }

    loadConfig() {
        try {
            const configPath = path.join('./config/config.json');
            this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            
            // 配置默认值
            this.config.cache = this.config.cache || {};
            this.config.cache.ttl = this.config.cache.ttl || 60000;
            this.config.cache.enabled = this.config.cache.enabled !== false;
            
        } catch (error) {
            console.error('无法加载配置文件:', error.message);
            process.exit(1);
        }
    }

    loadServers() {
        try {
            const serversPath = path.join('./config/servers.txt');
            const serversData = fs.readFileSync(serversPath, 'utf8');
            this.servers = new Map();

            let lineNumber = 0;
            serversData.split('\n').forEach(line => {
                lineNumber++;
                line = line.trim();
                
                if (line && !line.startsWith('#')) {
                    const [name, config] = line.split('=');
                    if (name && config) {
                        try {
                            const serverConfig = ServerConfigParser.parseConfig(config.trim());
                            if (serverConfig) {
                                this.servers.set(name.trim(), serverConfig);
                            }
                        } catch (error) {
                            console.warn(`配置文件第${lineNumber}行解析错误: ${error.message}`);
                        }
                    }
                }
            });

            console.log(`已加载 ${this.servers.size} 个服务器配置`);
        } catch (error) {
            console.error('无法加载服务器配置:', error.message);
            process.exit(1);
        }
    }

    async resolveSrvRecord(domain) {
        try {
            const records = await dns.resolveSrv(domain);
            if (records && records.length > 0) {
                // 按优先级排序，选择最高优先级的记录
                records.sort((a, b) => a.priority - b.priority);
                const record = records[0];
                return {
                    host: record.name,
                    port: record.port
                };
            }
        } catch (error) {
            throw new Error(`SRV记录解析失败: ${error.message}`);
        }
        throw new Error('未找到SRV记录');
    }

    async pingServer(host, port, type) {
        const timeout = this.config.ping?.timeout || 5000;
        
        if (type === 'bedrock') {
            return await BedrockPing.ping(host, port, timeout);
        } else {
            return await JavaPing.ping(host, port, timeout);
        }
    }

    async getServerStatus(serverName, clientIP) {
        if (!this.servers.has(serverName)) {
            this.logger.warn(clientIP, `/api/stats/${serverName}`, '服务器不存在');
            throw new Error('服务器不存在');
        }

        // 检查缓存
        if (this.config.cache.enabled) {
            const cached = this.cache.get(serverName);
            if (cached) {
                this.logger.info(clientIP, `/api/stats/${serverName}`, '返回缓存数据');
                return cached;
            }
        }

        const server = this.servers.get(serverName);
        let host = server.address;
        let port = server.port;

        // SRV记录解析
        if (server.isSrv) {
            try {
                const srvResult = await this.resolveSrvRecord(server.address);
                host = srvResult.host;
                port = srvResult.port;
                this.logger.debug(clientIP, `/api/stats/${serverName}`, `SRV解析: ${host}:${port}`);
            } catch (error) {
                this.logger.error(clientIP, `/api/stats/${serverName}`, `SRV解析失败: ${error.message}`);
                throw error;
            }
        }

        try {
            const startTime = Date.now();
            const status = await this.pingServer(host, port, server.type);
            const totalTime = Date.now() - startTime;

            const result = {
                name: serverName,
                online: true,
                type: status.type || server.type,
                version: status.version,
                players: status.players || {
                    online: status.currentPlayers || 0,
                    max: status.maxPlayers || 0
                },
                ping: status.ping || totalTime,
                timestamp: Date.now(),
                motd: status.motd,
                icon: status.icon,
                gamemode: status.gamemode,
                modinfo: status.modinfo
            };

            // 存入缓存
            if (this.config.cache.enabled) {
                this.cache.set(serverName, result);
            }

            this.logger.info(clientIP, `/api/stats/${serverName}`,
                `在线 ${result.players.online}/${result.players.max} [${result.type}] ${result.ping}ms`);
            return result;
        } catch (error) {
            const result = {
                name: serverName,
                online: false,
                error: error.message,
                timestamp: Date.now()
            };

            this.logger.warn(clientIP, `/api/stats/${serverName}`, `离线 - ${error.message}`);
            return result;
        }
    }

    async getServerStatusByIpPort(ipPortStr, clientIP) {
        const serverConfig = ServerConfigParser.parseIpPort(ipPortStr);
        const cacheKey = `direct_${serverConfig.address}_${serverConfig.port}_${serverConfig.type}`;

        // 检查缓存
        if (this.config.cache.enabled) {
            const cached = this.cache.get(cacheKey);
            if (cached) {
                this.logger.info(clientIP, `/api/stats/direct/${ipPortStr}`, '返回缓存数据');
                return cached;
            }
        }

        try {
            const startTime = Date.now();
            const status = await this.pingServer(serverConfig.address, serverConfig.port, serverConfig.type);
            const totalTime = Date.now() - startTime;

            const result = {
                name: `${serverConfig.address}:${serverConfig.port}`,
                address: serverConfig.address,
                port: serverConfig.port,
                online: true,
                type: status.type || serverConfig.type,
                version: status.version,
                players: status.players || {
                    online: status.currentPlayers || 0,
                    max: status.maxPlayers || 0
                },
                ping: status.ping || totalTime,
                timestamp: Date.now(),
                motd: status.motd,
                icon: status.icon,
                gamemode: status.gamemode,
                modinfo: status.modinfo
            };

            // 存入缓存
            if (this.config.cache.enabled) {
                this.cache.set(cacheKey, result);
            }

            this.logger.info(clientIP, `/api/stats/direct/${ipPortStr}`,
                `在线 ${result.players.online}/${result.players.max} [${result.type}] ${result.ping}ms`);
            return result;
        } catch (error) {
            const result = {
                name: `${serverConfig.address}:${serverConfig.port}`,
                address: serverConfig.address,
                port: serverConfig.port,
                online: false,
                error: error.message,
                timestamp: Date.now()
            };

            this.logger.warn(clientIP, `/api/stats/direct/${ipPortStr}`, `离线 - ${error.message}`);
            return result;
        }
    }

    setupRoutes() {
        const app = this.webServer.app;

        // Token验证中间件
        const tokenMiddleware = (req, res, next) => {
            const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
            if (!token || token !== process.env.ADMIN_TOKEN) {
                return res.status(403).json({ error: '无效的token' });
            }
            next();
        };

        // 健康检查
        app.get('/health', (req, res) => {
            res.json({ 
                status: 'ok', 
                timestamp: Date.now(),
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                cache: this.cache.getStats()
            });
        });

        const apiRouter = require('express').Router();

        // 获取所有服务器列表
        apiRouter.get('/servers', (req, res) => {
            const serverList = Array.from(this.servers.entries()).map(([name, config]) => ({
                name,
                type: config.type,
                isSrv: config.isSrv,
                address: config.address,
                port: config.port
            }));
            res.json({ 
                servers: serverList,
                count: serverList.length
            });
        });

        // 直接通过IP:Port查询
        apiRouter.get('/stats/direct/:ipport(*)', async (req, res) => {
            const clientIP = this.webServer.getClientIP(req);
            const ipPortStr = req.params.ipport;

            try {
                const status = await this.getServerStatusByIpPort(ipPortStr, clientIP);
                res.json(status);
            } catch (error) {
                res.status(400).json({
                    error: error.message,
                    examples: [
                        "127.0.0.1:25565",
                        "192.168.1.100:19132:bedrock",
                        "[2001:db8::1]:25565:java"
                    ]
                });
            }
        });

        // 获取单个服务器状态
        apiRouter.get('/stats/:serverName', async (req, res) => {
            const clientIP = this.webServer.getClientIP(req);
            const serverName = req.params.serverName;

            try {
                const status = await this.getServerStatus(serverName, clientIP);
                res.json(status);
            } catch (error) {
                res.status(404).json({ error: error.message });
            }
        });

        // 获取所有服务器状态
        apiRouter.get('/stats', async (req, res) => {
            const clientIP = this.webServer.getClientIP(req);
            const results = {};
            const startTime = Date.now();

            this.logger.info(clientIP, '/api/stats', `查询所有服务器状态`);

            const promises = Array.from(this.servers.keys()).map(async (serverName) => {
                try {
                    const status = await this.getServerStatus(serverName, clientIP);
                    results[serverName] = status;
                } catch (error) {
                    results[serverName] = {
                        name: serverName,
                        online: false,
                        error: error.message,
                        timestamp: Date.now()
                    };
                }
            });

            await Promise.all(promises);
            
            const totalTime = Date.now() - startTime;
            res.json({
                results,
                meta: {
                    total: this.servers.size,
                    queryTime: totalTime,
                    timestamp: Date.now()
                }
            });
        });

        // 管理接口
        apiRouter.get('/admin/cache/stats', tokenMiddleware, (req, res) => {
            res.json(this.cache.getStats());
        });

        apiRouter.post('/admin/cache/clear', tokenMiddleware, (req, res) => {
            const clientIP = this.webServer.getClientIP(req);
            const cleared = this.cache.clear();
            this.logger.info(clientIP, '/api/admin/cache/clear', `已清除 ${cleared} 个缓存项`);
            res.json({ message: '缓存已清除', cleared });
        });

        apiRouter.post('/admin/reload', tokenMiddleware, (req, res) => {
            const clientIP = this.webServer.getClientIP(req);
            try {
                this.loadServers();
                this.cache.clear();
                this.logger.info(clientIP, '/api/admin/reload', '配置已重新加载');
                res.json({ 
                    message: '配置已重新加载', 
                    servers: this.servers.size 
                });
            } catch (error) {
                this.logger.error(clientIP, '/api/admin/reload', error.message);
                res.status(500).json({ error: '重新加载失败: ' + error.message });
            }
        });

        // 挂载API路由
        app.use('/api', apiRouter);

        // 404处理
        app.use('*', (req, res) => {
            const clientIP = this.webServer.getClientIP(req);
            this.logger.warn(clientIP, req.originalUrl, '资源不存在');
            res.status(404).json({ 
                error: '资源不存在',
                path: req.originalUrl
            });
        });
    }

    setupCleanupTasks() {
        // 定期清理过期缓存
        setInterval(() => {
            const cleaned = this.cache.cleanup();
            if (cleaned > 0) {
                this.logger.debug('system', 'cache-cleanup', `清理了 ${cleaned} 个过期缓存项`);
            }
        }, this.config.cache.cleanupInterval || 60000);

        // 定期记录缓存统计
        if (this.config.cache.logStats) {
            setInterval(() => {
                const stats = this.cache.getStats();
                this.logger.info('system', 'cache-stats', 
                    `缓存统计: 命中率 ${(stats.hitRate * 100).toFixed(2)}%, 大小 ${stats.size}`);
            }, this.config.cache.statsInterval || 300000);
        }
    }

    start() {
        this.webServer.start();
        this.logger.info('system', 'startup', `MC状态API服务已启动`);
    }

    stop() {
        this.webServer.stop();
        this.logger.info('system', 'shutdown', 'MC状态API服务已关闭');
    }
}

// 启动应用
const api = new MCStatusAPI();
api.start();

// 优雅关闭
const shutdown = (signal) => {
    console.log(`\n收到 ${signal} 信号，正在关闭服务器...`);
    api.stop();
    setTimeout(() => process.exit(0), 1000);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (error) => {
    console.error('未捕获异常:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的Promise拒绝:', reason);
});