import pkg from 'pg';
const { Client } = pkg;

class SarathiTestingScheduler {
    constructor() {
        this.dbClient = new Client({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        });
    }

    async initialize() {
        console.log('🛑 SCHEDULER DISABLED - Safe mode activated');
        console.log('📝 No messages will be sent until properly configured');
        return;
    }

    async scheduleDailyMessages() {
        console.log('🚫 Messages not sent - Scheduler is in safe mode');
        return { status: 'disabled', message: 'Scheduler safely disabled' };
    }

    startScheduler() {
        console.log('⏸️  Scheduler paused - No automatic messages');
    }
}

// Create and export instance
const scheduler = new SarathiTestingScheduler();
export default scheduler;

// Auto-start if run directly
const isMainModule = process.argv[1] && process.argv[1].includes('scheduler.js');
if (isMainModule) {
    scheduler.initialize().then(() => {
        console.log('✅ Scheduler safely disabled - No messages will be sent');
        process.exit(0);
    });
}
