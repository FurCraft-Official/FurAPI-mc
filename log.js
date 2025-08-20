// log.js
const fs = require('fs');
const path = require('path');

class Logger {
    constructor(config = {}) {
        this.config = {
            level: config.level || 'info',
            file: config.file || null,
            console: config.console !== false, // 默认启用控制台输出
            timestamp: config.timestamp !== false, // 默认启用时间戳
            colors: config.colors !== false, // 默认启用颜色
            ...config
        };

        this.levels = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3
        };

        this.colors = {
            debug: '\x1b[36m',    // 青色
            info: '\x1b[32m',     // 绿色
            warn: '\x1b[33m',     // 黄色
            error: '\x1b[31m',    // 红色
            reset: '\x1b[0m'      // 重置
        };

        // 创建日志目录
        if (this.config.file) {
            const logDir = path.dirname(this.config.file);
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
        }
    }

    shouldLog(level) {
        return this.levels[level] >= this.levels[this.config.level];
    }

    formatMessage(level, ip, resource, message = '') {
        const timestamp = this.config.timestamp ? 
            new Date().toISOString().replace('T', ' ').substring(0, 19) + ' ' : '';
        
        return `${timestamp}${level.toUpperCase()} ${ip} ${resource} ${message}`.trim();
    }

    writeLog(level, ip, resource, message = '') {
        if (!this.shouldLog(level)) return;

        const logMessage = this.formatMessage(level, ip, resource, message);

        // 控制台输出
        if (this.config.console) {
            const coloredMessage = this.config.colors ? 
                `${this.colors[level]}${logMessage}${this.colors.reset}` : 
                logMessage;
            console.log(coloredMessage);
        }

        // 文件输出
        if (this.config.file) {
            const fileMessage = logMessage + '\n';
            fs.appendFileSync(this.config.file, fileMessage, 'utf8');
        }
    }

    debug(ip, resource, message = '') {
        this.writeLog('debug', ip, resource, message);
    }

    info(ip, resource, message = '') {
        this.writeLog('info', ip, resource, message);
    }

    warn(ip, resource, message = '') {
        this.writeLog('warn', ip, resource, message);
    }

    error(ip, resource, message = '') {
        this.writeLog('error', ip, resource, message);
    }

    // 便捷方法，用于记录HTTP请求
    request(req, additionalInfo = '') {
        const clientIP = this.getClientIP(req);
        const resource = `${req.method} ${req.path}`;
        this.info(clientIP, resource, additionalInfo);
    }

    // 便捷方法，用于记录HTTP响应
    response(req, res, additionalInfo = '') {
        const clientIP = this.getClientIP(req);
        const resource = `${req.method} ${req.path}`;
        const statusInfo = `[${res.statusCode}]`;
        this.info(clientIP, resource, `${statusInfo} ${additionalInfo}`.trim());
    }

    getClientIP(req) {
        return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
               req.headers['x-real-ip'] ||
               req.connection.remoteAddress || 
               req.socket.remoteAddress ||
               (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
               'unknown';
    }

    // 旋转日志文件
    rotateLog() {
        if (!this.config.file) return;

        try {
            const stats = fs.statSync(this.config.file);
            const maxSize = this.config.maxFileSize || 10 * 1024 * 1024; // 默认10MB

            if (stats.size > maxSize) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const rotatedFile = `${this.config.file}.${timestamp}`;
                
                fs.renameSync(this.config.file, rotatedFile);
                this.info('system', 'log-rotation', `日志文件已旋转: ${rotatedFile}`);
            }
        } catch (error) {
            this.error('system', 'log-rotation', `日志旋转失败: ${error.message}`);
        }
    }
}

module.exports = Logger;