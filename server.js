const app = require('./src/app');
const { PORT } = require('./src/config/constants');

// app.listen(PORT, () => {
//     console.log(`Server running on port ${PORT}`);
// });
const SessionManager = require('./src/services/sessionManager');

async function startApp() {

    // إعادة الاتصال بالجلسات الموجودة
    await SessionManager.reconnectSessions();

    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

startApp();