const SystemMonitor = require('../services/systemMonitor');
const WhatsAppManager = require('../services/whatsappService');

async function getDashboardInfo(req, res) {
    try {
        // الحصول على معلومات النظام
        const systemInfo = SystemMonitor.getSystemInfo();
        
        // الحصول على حالة WhatsApp
        const whatsappStatus = await SystemMonitor.getWhatsAppStatus(WhatsAppManager);

        res.json({
            status: 'success',
            data: {
                system: systemInfo,
                whatsapp: whatsappStatus,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error fetching dashboard information',
            error: error.message
        });
    }
}

module.exports = {
    getDashboardInfo
};