const os = require('os');
const process = require('process');

class SystemMonitor {
    static getSystemInfo() {
        try {
            // معلومات النظام الأساسية
            const systemInfo = {
                os: {
                    platform: os.platform(),
                    type: os.type(),
                    release: os.release(),
                    arch: os.arch(),
                    hostname: os.hostname(),
                    uptime: this.formatUptime(os.uptime())
                },
                cpu: {
                    model: os.cpus()[0].model,
                    cores: os.cpus().length,
                    speed: os.cpus()[0].speed,
                    usage: this.getCpuUsage()
                },
                memory: {
                    total: this.formatBytes(os.totalmem()),
                    free: this.formatBytes(os.freemem()),
                    used: this.formatBytes(os.totalmem() - os.freemem()),
                    usagePercentage: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2)
                },
                process: {
                    pid: process.pid,
                    nodeVersion: process.version,
                    uptime: this.formatUptime(process.uptime()),
                    memoryUsage: {
                        rss: this.formatBytes(process.memoryUsage().rss),
                        heapTotal: this.formatBytes(process.memoryUsage().heapTotal),
                        heapUsed: this.formatBytes(process.memoryUsage().heapUsed),
                        external: this.formatBytes(process.memoryUsage().external)
                    }
                },
                network: this.getNetworkInterfaces()
            };

            return systemInfo;
        } catch (error) {
            console.error('Error getting system info:', error);
            throw error;
        }
    }

    static getCpuUsage() {
        try {
            const cpus = os.cpus();
            let totalIdle = 0;
            let totalTick = 0;

            cpus.forEach(cpu => {
                for (const type in cpu.times) {
                    totalTick += cpu.times[type];
                }
                totalIdle += cpu.times.idle;
            });

            const usagePercentage = 100 - (totalIdle / totalTick * 100);
            return usagePercentage.toFixed(2);
        } catch (error) {
            console.error('Error getting CPU usage:', error);
            return '0';
        }
    }

    static getNetworkInterfaces() {
        try {
            const interfaces = os.networkInterfaces();
            const networkInfo = {};

            for (const [name, addresses] of Object.entries(interfaces)) {
                networkInfo[name] = addresses.map(addr => ({
                    address: addr.address,
                    family: addr.family,
                    internal: addr.internal
                }));
            }

            return networkInfo;
        } catch (error) {
            console.error('Error getting network interfaces:', error);
            return {};
        }
    }

    static formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    }

    static formatUptime(seconds) {
        const days = Math.floor(seconds / (3600 * 24));
        const hours = Math.floor((seconds % (3600 * 24)) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (secs > 0) parts.push(`${secs}s`);

        return parts.join(' ');
    }

    static async getWhatsAppStatus(WhatsAppManager) {
        try {
            const sessions = WhatsAppManager.getSessions();
            if (!sessions || !(sessions instanceof Map)) {
                return {
                    totalSessions: 0,
                    activeSessions: 0,
                    sessions: []
                };
            }

            const status = {
                totalSessions: sessions.size,
                activeSessions: 0,
                sessions: []
            };

            // تحويل Map إلى Array للتكرار
            const sessionsArray = Array.from(sessions.entries());
            
            for (const [sessionId, socket] of sessionsArray) {
                const isConnected = socket?.user?.id ? true : false;
                const sessionInfo = {
                    id: sessionId.slice(-13, -1),
                    connected: isConnected,
                    user: isConnected ? {
                        id: socket.user.id.slice(0, 6),
                        name: socket.user.name || 'Unknown'
                    } : null
                };

                status.sessions.push(sessionInfo);
                if (isConnected) {
                    status.activeSessions++;
                }
            }

            return status;
        } catch (error) {
            console.error('Error getting WhatsApp status:', error);
            return {
                totalSessions: 0,
                activeSessions: 0,
                sessions: []
            };
        }
    }

}

module.exports = SystemMonitor;