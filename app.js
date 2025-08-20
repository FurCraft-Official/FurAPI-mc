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
