const express = require('express');
const rateLimit = require('express-rate-limit');
const https = require('https');
const fs = require('fs');
const path = require('path');  // 引入 path 模块

class WebServer {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.app = express();
        this.setupMiddleware();
    }

    setupMiddleware() {
        // 挂载静态文件目录
        const staticDir = this.config.staticDir || './public'; // 默认为 './public'
        this.app.use(express.static(staticDir));

        // 速率限制
        if (this.config.rateLimit.enabled) {
            const limiter = rateLimit({
                windowMs: this.config.rateLimit.windowMs,
                max: this.config.rateLimit.max,
                message: { error: '请求过于频繁，请稍后再试' },
                standardHeaders: true,
                legacyHeaders: false,
                handler: (req, res) => {
                    const clientIP = this.getClientIP(req);
                    this.logger.warn(clientIP, req.path, '触发速率限制');
                    res.status(429).json({ error: '请求过于频繁，请稍后再试' });
                }
            });
            this.app.use(limiter);
        }

        // JSON解析
        this.app.use(express.json());

        // CORS支持
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
            res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            
            if (req.method === 'OPTIONS') {
                res.sendStatus(200);
            } else {
                next();
            }
        });

        // 请求日志
        this.app.use((req, res, next) => {
            const clientIP = this.getClientIP(req);
            this.logger.info(clientIP, req.path, `${req.method} ${req.originalUrl}`);
            next();
        });

        // 响应时间记录
        this.app.use((req, res, next) => {
            const start = Date.now();
            res.on('finish', () => {
                const duration = Date.now() - start;
                const clientIP = this.getClientIP(req);
                this.logger.debug(clientIP, req.path, `响应时间: ${duration}ms 状态码: ${res.statusCode}`);
            });
            next();
        });
        // 根目录返回 index.html
        this.app.get('/', (req, res) => {
             const indexPath = path.resolve(this.config.staticDir || './public', 'index.html');
             res.sendFile(indexPath);
        });

    }

    getClientIP(req) {
        return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
               req.headers['x-real-ip'] ||
               req.connection.remoteAddress || 
               req.socket.remoteAddress ||
               (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
               'unknown';
    }

    start() {
        // 启动 HTTP 服务器
        this.httpServer = this.app.listen(this.config.http.port, this.config.listenIP, () => {
            this.logger.info('system', 'startup', 
                `HTTP服务器启动在 http://${this.config.listenIP}:${this.config.http.port}`);
        });

        this.httpServer.on('error', (error) => {
            this.logger.error('system', 'http-server', `HTTP服务器错误: ${error.message}`);
        });

        // 启动 HTTPS 服务器（如果启用）
        if (this.config.https.enabled) {
            try {
                const privateKey = fs.readFileSync(this.config.https.keyPath, 'utf8');
                const certificate = fs.readFileSync(this.config.https.certPath, 'utf8');
                const credentials = { key: privateKey, cert: certificate };

                this.httpsServer = https.createServer(credentials, this.app);
                this.httpsServer.listen(this.config.https.port, this.config.listenIP, () => {
                    this.logger.info('system', 'startup', 
                        `HTTPS服务器启动在 https://${this.config.listenIP}:${this.config.https.port}`);
                });

                this.httpsServer.on('error', (error) => {
                    this.logger.error('system', 'https-server', `HTTPS服务器错误: ${error.message}`);
                });
            } catch (error) {
                this.logger.error('system', 'startup', `HTTPS启动失败: ${error.message}`);
            }
        }

        this.logger.info('system', 'startup', 'Web服务器模块初始化完成');
    }

    stop() {
        if (this.httpServer) {
            this.httpServer.close(() => {
                this.logger.info('system', 'shutdown', 'HTTP服务器已关闭');
            });
        }

        if (this.httpsServer) {
            this.httpsServer.close(() => {
                this.logger.info('system', 'shutdown', 'HTTPS服务器已关闭');
            });
        }
    }
}

module.exports = WebServer;
