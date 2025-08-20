require('./init.js')
require('dotenv').config();  // 加载 .env 文件

const fs = require('fs');
const path = require('path');
const mcping = require('mc-ping-updated');
const dns = require('dns').promises;
const Logger = require('./log');
const WebServer = require('./web');

// 基岩版 ping 实现
class BedrockPing {
    static ping(host, port = 19132, timeout = 5000) {
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
                            icon: null  // 暂时返回 null 或者替换为实际图标
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

class CacheManager {
    constructor(ttl = 60000) {
        this.cache = new Map();
        this.ttl = ttl;
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;

        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            return null;
        }

        return item.data;
    }

    set(key, data) {
        this.cache.set(key, {
            data,
            expiry: Date.now() + this.ttl
        });
    }

    clear() {
        this.cache.clear();
    }
}

class MCStatusAPI {
    constructor() {
        this.loadConfig();
        this.loadServers();
        this.logger = new Logger(this.config.logging);
        this.cache = new CacheManager(this.config.cache.ttl);
        this.webServer = new WebServer(this.config, this.logger);
        this.setupRoutes();
    }

    loadConfig() {
        try {
            const configPath = path.join('./config/config.json');
            this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
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

            serversData.split('\n').forEach(line => {
                line = line.trim();
                if (line && !line.startsWith('#')) {
                    const [name, config] = line.split('=');
                    if (name && config) {
                        const serverConfig = this.parseServerConfig(config.trim());
                        if (serverConfig) {
                            this.servers.set(name.trim(), serverConfig);
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

    parseServerConfig(configStr) {
        const parts = configStr.split(':');

        if (parts.length < 1) return null;

        const address = parts[0];
        const port = parseInt(parts[1]) || (parts[2] === 'bedrock' ? 19132 : 25565);
        const type = parts[2] || 'java';
        const isSrv = parts[3] === 'true';

        return { address, port, type, isSrv };
    }

    // 新增：解析 IP:Port 格式的参数
    parseIpPort(ipPortStr, clientIP) {
        // 验证输入格式
        if (!ipPortStr || typeof ipPortStr !== 'string') {
            this.logger.warn(clientIP, `/api/stats/direct/${ipPortStr}`, '无效的IP:Port格式');
            throw new Error('无效的IP:Port格式');
        }

        // 支持 IPv4:Port 和 IPv6:Port 格式
        let host, port, type = 'java';

        // 检查是否包含类型参数 (ip:port:type)
        const parts = ipPortStr.split(':');

        if (parts.length < 2) {
            throw new Error('缺少端口号');
        }

        if (parts.length === 2) {
            // 格式: ip:port
            host = parts[0];
            port = parseInt(parts[1]);
        } else if (parts.length === 3) {
            // 格式: ip:port:type 或 IPv6的情况
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
            // 处理 IPv6 地址或其他复杂情况
            // 假设最后一个或最后两个部分是端口和类型
            const lastPart = parts[parts.length - 1];
            const secondLastPart = parts[parts.length - 2];

            if (lastPart === 'java' || lastPart === 'bedrock') {
                // 格式: ipv6:port:type
                type = lastPart;
                port = parseInt(secondLastPart);
                host = parts.slice(0, -2).join(':');
            } else {
                // 格式: ipv6:port
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

    async resolveSrvRecord(domain) {
        try {
            const records = await dns.resolveSrv(domain);
            if (records && records.length > 0) {
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

    async pingJavaServer(host, port) {
        return new Promise((resolve, reject) => {
            mcping(host, port, (err, res) => {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        type: 'java',
                        version: res.version?.name || 'Unknown',
                        protocol: res.version?.protocol || 0,
                        players: {
                            online: res.players?.online || 0,
                            max: res.players?.max || 0
                        },
                        ping: res.ping || 0,
                        motd: res.description || 'No MOTD',  // 获取 motd
                        icon: res.favicon || null  // 获取图标（base64 编码）
                    });
                }
            }, 5000);
        });
    }

    async pingBedrockServer(host, port) {
        try {
            const res = await BedrockPing.ping(host, port);
            return {
                type: 'bedrock',
                version: res.version || 'Unknown',
                protocol: res.protocol || 0,
                players: {
                    online: res.currentPlayers || 0,
                    max: res.maxPlayers || 0
                },
                ping: 0,
                gamemode: res.gamemode || '',
                motd: res.motd || 'No MOTD',  // 获取 motd
                icon: null  // 返回图标（可以提供默认图标或通过 URL 获取）
            };
        } catch (error) {
            throw error;
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

        // 如果是SRV记录，先解析
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
            let status;
            const startTime = Date.now();

            if (server.type === 'bedrock') {
                status = await this.pingBedrockServer(host, port);
            } else {
                status = await this.pingJavaServer(host, port);
            }

            const pingTime = Date.now() - startTime;

            const result = {
                name: serverName,
                online: true,
                type: status.type,
                version: status.version,
                players: status.players,
                ping: status.ping || pingTime,
                timestamp: Date.now(),
                motd: status.motd,
                icon: status.icon
            };

            // 存入缓存
            if (this.config.cache.enabled) {
                this.cache.set(serverName, result);
            }

            this.logger.info(clientIP, `/api/stats/${serverName}`,
                `在线 ${status.players.online}/${status.players.max} [${status.type}] ${pingTime}ms`);
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

    // 新增：直接通过 IP:Port 查询服务器状态
    async getServerStatusByIpPort(ipPortStr, clientIP) {
        // 解析 IP:Port 参数
        const serverConfig = this.parseIpPort(ipPortStr, clientIP);
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
            let status;
            const startTime = Date.now();

            if (serverConfig.type === 'bedrock') {
                status = await this.pingBedrockServer(serverConfig.address, serverConfig.port);
            } else {
                status = await this.pingJavaServer(serverConfig.address, serverConfig.port);
            }

            const pingTime = Date.now() - startTime;

            const result = {
                name: `${serverConfig.address}:${serverConfig.port}`,
                address: serverConfig.address,
                port: serverConfig.port,
                online: true,
                type: status.type,
                version: status.version,
                players: status.players,
                ping: status.ping || pingTime,
                timestamp: Date.now(),
                motd: status.motd,
                icon: status.icon
            };

            // 存入缓存
            if (this.config.cache.enabled) {
                this.cache.set(cacheKey, result);
            }

            this.logger.info(clientIP, `/api/stats/direct/${ipPortStr}`,
                `在线 ${status.players.online}/${status.players.max} [${status.type}] ${pingTime}ms`);
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

        // 环境变量 token 验证中间件
        const tokenMiddleware = (req, res, next) => {
            const token = req.query.token;
            if (!token || token !== process.env.ADMIN_TOKEN) {
                return res.status(403).json({ error: '无效的 token' });
            }
            next();
        };

        // 健康检查
        app.get('/health', (req, res) => {
            res.json({ status: 'ok', timestamp: Date.now() });
        });

        // API路由组
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
            res.json({ servers: serverList });
        });

        // 【新增】直接通过 IP:Port 查询服务器状态
        apiRouter.get('/stats/direct/:ipport(*)', async (req, res) => {
            const clientIP = this.webServer.getClientIP(req);
            const ipPortStr = req.params.ipport;

            try {
                const status = await this.getServerStatusByIpPort(ipPortStr, clientIP);
                res.json(status);
            } catch (error) {
                res.status(400).json({
                    error: error.message,
                    example: "127.0.0.1:25565 or 192.168.1.100:19132:bedrock"
                });
            }
        });

        // 获取单个服务器状态（配置文件中的服务器）
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
            res.json(results);
        });

        // 管理端缓存清除
        apiRouter.post('/admin/cache/clear', tokenMiddleware, (req, res) => {
            const clientIP = this.webServer.getClientIP(req);
            this.cache.clear();
            this.logger.info(clientIP, '/api/admin/cache/clear', '缓存已清除');
            res.json({ message: '缓存已清除' });
        });

        // 重新加载服务器配置
        apiRouter.post('/admin/reload', tokenMiddleware, (req, res) => {
            const clientIP = this.webServer.getClientIP(req);
            try {
                this.loadServers();
                this.cache.clear();
                this.logger.info(clientIP, '/api/admin/reload', '配置已重新加载');
                res.json({ message: '配置已重新加载', servers: this.servers.size });
            } catch (error) {
                this.logger.error(clientIP, '/api/admin/reload', error.message);
                res.status(500).json({ error: '重新加载失败: ' + error.message });
            }
        });

        // 挂载API路由到/api路径
        app.use('/api', apiRouter);

        // 404处理
        app.use('*', (req, res) => {
            const clientIP = this.webServer.getClientIP(req);
            this.logger.warn(clientIP, req.path, '资源不存在');
            res.status(404).json({ error: '资源不存在' });
        });
    }

    start() {
        this.webServer.start();

        // 定期清理过期缓存
        setInterval(() => {
            const beforeSize = this.cache.cache.size;
            for (const key of this.cache.cache.keys()) {
                this.cache.get(key);
            }
            const afterSize = this.cache.cache.size;
            if (beforeSize !== afterSize) {
                this.logger.info('system', 'cache-cleanup', `清理了 ${beforeSize - afterSize} 个过期缓存项`);
            }
        }, 60000);
    }
}

// 启动应用
const api = new MCStatusAPI();
api.start();

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n正在关闭服务器...');
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('未捕获异常:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的Promise拒绝:', reason);
});