// scheduler.js - Sarathi AI Template Testing Scheduler (FIXED - HELTAR API)
import pkg from 'pg';
const { Client } = pkg;
import axios from 'axios';
import cron from 'node-cron';

class SarathiTestingScheduler {
    constructor() {
        // Create new client instance each time
        this.dbConfig = {
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        };
        
        // 6-Day Template Rotation Schedule - STARTING FROM DAY 1
        this.templateSchedule = [
            { 
                day: 1, 
                template: 'problem_solver_english', 
                id: '1203964201590524', 
                language: 'english',
                language_code: 'en',
                category: 'problem_solver'
            },
            { 
                day: 2, 
                template: 'daily_wisdom_english', 
                id: '748634401541350', 
                language: 'english',
                language_code: 'en',
                category: 'daily_wisdom'
            },
            { 
                day: 3, 
                template: 'emotional_check_in_english', 
                id: '1779815382653468', 
                language: 'english',
                language_code: 'en',
                category: 'emotional_checkin'
            },
            { 
                day: 4, 
                template: 'problem_solver_hindi', 
                id: '2038691776889448', 
                language: 'hindi',
                language_code: 'hi',
                category: 'problem_solver'
            },
            { 
                day: 5, 
                template: 'daily_wisdom_hindi', 
                id: '1918171358731282', 
                language: 'hindi',
                language_code: 'hi',
                category: 'daily_wisdom'
            },
            { 
                day: 6, 
                template: 'emotional_checkin_hindi', 
                id: '1362219698629498', 
                language: 'hindi',
                language_code: 'hi',
                category: 'emotional_checkin'
            }
        ];

        this.heltarApiKey = process.env.HELTAR_API_KEY;
        this.heltarPhoneId = process.env.HELTAR_PHONE_ID;
        
        console.log('✅ Sarathi Testing Scheduler Initialized');
        console.log('📅 6-Day Template Rotation Ready');
    }

    async getDbClient() {
        const client = new Client(this.dbConfig);
        await client.connect();
        return client;
    }

    async initialize() {
        try {
            console.log('✅ Database connection initialized');
            await this.ensureAllUsersSubscribed();
            await this.verifyWhatsAppCredentials();
        } catch (error) {
            console.error('❌ Scheduler initialization failed:', error.message);
            throw error;
        }
    }

    async ensureAllUsersSubscribed() {
        const client = await this.getDbClient();
        try {
            const result = await client.query(`
                UPDATE users SET subscribed_daily = true 
                WHERE phone_number IS NOT NULL 
                AND phone_number != ''
                RETURNING COUNT(*) as updated_count
            `);
            console.log(`✅ Enabled ${result.rows[0].updated_count} users for daily messages`);
        } catch (error) {
            console.error('❌ Failed to enable users:', error.message);
        } finally {
            await client.end();
        }
    }

    async verifyWhatsAppCredentials() {
        if (!this.heltarApiKey || !this.heltarPhoneId) {
            console.log('❌ HELTAR credentials missing');
            return false;
        }
        console.log('✅ HELTAR credentials verified');
        return true;
    }

    async loadAllSubscribedUsers() {
        const client = await this.getDbClient();
        try {
            const result = await client.query(`
                SELECT phone_number, language_preference as language
                FROM users 
                WHERE subscribed_daily = true 
                AND phone_number IS NOT NULL 
                AND phone_number != ''
            `);
            console.log(`📊 Loaded ${result.rows.length} subscribed users`);
            return result.rows;
        } catch (error) {
            console.error('❌ Failed to load users:', error.message);
            return [];
        } finally {
            await client.end();
        }
    }

    getCurrentDayTemplate() {
        const startDate = new Date('2024-10-22');
        const currentDate = new Date();
        const diffTime = currentDate - startDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const dayOfCycle = (diffDays % 6) + 1;
        
        const template = this.templateSchedule.find(t => t.day === dayOfCycle);
        console.log(`📅 Day ${dayOfCycle}: Using template ${template.template}`);
        return template;
    }

    getTemplateForDay(day) {
        return this.templateSchedule.find(t => t.day === day) || this.templateSchedule[0];
    }

    // FIXED: CORRECT HELTAR API STRUCTURE
    createHeltarTemplatePayload(user, template) {
        // Clean phone number - remove + and any spaces
        const cleanPhone = user.phone_number.replace(/\D/g, '');
        
        // CORRECT HELTAR TEMPLATE STRUCTURE
        const templatePayload = {
            name: template.template,
            language: {
                code: template.language_code,
                policy: "deterministic"
            }
        };

        // CORRECT HELTAR API PAYLOAD STRUCTURE
        const heltarPayload = {
            messages: [{
                clientWaNumber: cleanPhone, // Use cleaned number without +
                message: templatePayload,
                messageType: "template"
            }]
        };

        console.log(`📨 HELTAR Payload for ${template.template}:`, JSON.stringify(heltarPayload, null, 2));
        return heltarPayload;
    }

    async sendTemplateMessage(user, template) {
        const messageId = `msg_${Date.now()}_${user.phone_number.replace('+', '')}`;
        
        try {
            console.log(`📤 Attempting to send ${template.template} to ${user.phone_number}`);
            
            // Create CORRECT HELTAR payload
            const heltarPayload = this.createHeltarTemplatePayload(user, template);
            
            // Send via HELTAR API
            const response = await axios.post(
                `https://api.heltar.com/v1/messages/send`,
                heltarPayload,
                {
                    headers: {
                        'Authorization': `Bearer ${this.heltarApiKey}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    timeout: 30000
                }
            );

            console.log(`✅ API Response for ${user.phone_number}:`, response.data);

            // Log successful message
            await this.logMessageSent(messageId, user.phone_number, template, response.data);
            console.log(`✅ Sent ${template.template} to ${user.phone_number}`);
            
            return { success: true, messageId };

        } catch (error) {
            const errorDetails = {
                status: error.response?.status,
                error: error.response?.data || error.message
            };
            
            console.error(`❌ Failed to send to ${user.phone_number}:`, errorDetails);
            
            // Log failed message
            await this.logMessageSent(messageId, user.phone_number, template, null, 'failed');
            
            return { success: false, error: error.message };
        }
    }

    async logMessageSent(messageId, phone, template, apiResponse = null, status = 'sent') {
        const client = await this.getDbClient();
        try {
            const query = `
                INSERT INTO morning_messages_sent 
                (message_id, phone, template_id, template_name, sent_time, delivery_status, language, category)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `;
            
            await client.query(query, [
                messageId,
                phone,
                template.id,
                template.template,
                new Date(),
                status,
                template.language,
                template.category
            ]);

            console.log(`📊 Logged message ${messageId} for template ${template.template}`);
        } catch (error) {
            console.error('❌ Failed to log message:', error.message);
        } finally {
            await client.end();
        }
    }

    async scheduleDailyMessages(manualDay = null) {
        try {
            console.log('🚀 Starting daily message scheduling...');
            
            const currentTemplate = manualDay ? this.getTemplateForDay(manualDay) : this.getCurrentDayTemplate();
            const allUsers = await this.loadAllSubscribedUsers();
            
            if (allUsers.length === 0) {
                console.log('❌ No subscribed users found.');
                return {
                    success: false,
                    error: 'No subscribed users',
                    template: currentTemplate.template,
                    sent: 0,
                    total: 0
                };
            }

            console.log(`🎯 Template: ${currentTemplate.template}`);
            console.log(`🌐 Language: ${currentTemplate.language_code}`);
            console.log(`👥 Total Users: ${allUsers.length}`);

            // TEST WITH JUST 1 USER FIRST
            const testUser = allUsers[0];
            console.log(`🧪 TEST: Sending to 1 user only: ${testUser.phone_number}`);

            let sentCount = 0;
            let failedCount = 0;

            const result = await this.sendTemplateMessage(testUser, currentTemplate);
            if (result.success) {
                sentCount++;
                console.log('🎉 SUCCESS! Message sent successfully!');
            } else {
                failedCount++;
                console.log('❌ FAILED! Check the error details above.');
            }

            const report = {
                date: new Date().toISOString().split('T')[0],
                template: currentTemplate.template,
                template_id: currentTemplate.id,
                total_users: 1,
                sent_successfully: sentCount,
                failed: failedCount,
                success_rate: sentCount > 0 ? '100%' : '0%'
            };

            console.log('📋 TEST RESULTS:');
            console.log(`   📨 Sent: ${sentCount}`);
            console.log(`   ❌ Failed: ${failedCount}`);
            console.log(`   📊 Success Rate: ${report.success_rate}`);

            return report;

        } catch (error) {
            console.error('❌ Error in scheduleDailyMessages:', error);
            return {
                success: false,
                error: error.message,
                template: 'unknown',
                sent: 0,
                total: 0
            };
        }
    }

    async logDailyReport(report) {
        const client = await this.getDbClient();
        try {
            await client.query(`
                INSERT INTO ab_test_results 
                (test_id, test_date, template_a_id, template_b_id, template_a_engagement, sample_size)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [
                `test_${Date.now()}`,
                report.date,
                report.template_id,
                'daily_performance',
                parseFloat(report.success_rate) || 0,
                report.total_users
            ]);
            console.log('📊 Daily report logged to analytics');
        } catch (error) {
            console.error('❌ Failed to log daily report:', error.message);
        } finally {
            await client.end();
        }
    }

    getISTCronTime() {
        return '0 2 * * *'; // 2:00 AM UTC = 7:30 AM IST
    }

    startScheduler() {
        const istCronTime = this.getISTCronTime();
        console.log('⏰ Scheduling daily messages at 7:30 AM IST...');
        
        cron.schedule(istCronTime, async () => {
            console.log('🕗 7:30 AM IST - Starting daily message sending...');
            try {
                const report = await this.scheduleDailyMessages();
                console.log('✅ Daily messages completed');
            } catch (error) {
                console.error('❌ Daily messages failed:', error);
            }
        });

        console.log('✅ Scheduler started successfully');
    }

    async manualTrigger(day = null) {
        console.log('🔧 Manual trigger activated...');
        return await this.scheduleDailyMessages(day);
    }
}

// Create fresh instance
const scheduler = new SarathiTestingScheduler();

// Auto-start if run directly
const isMainModule = process.argv[1] && process.argv[1].includes('scheduler.js');
if (isMainModule) {
    if (process.argv.includes('--manual')) {
        console.log('🔧 Running manual trigger...');
        const manualDay = process.argv.find(arg => arg.startsWith('--day='))?.split('=')[1];
        scheduler.initialize().then(async () => {
            const result = await scheduler.manualTrigger(manualDay ? parseInt(manualDay) : null);
            console.log('📋 Final Result:', result);
            process.exit(0);
        }).catch(error => {
            console.error('❌ Manual trigger failed:', error);
            process.exit(1);
        });
    } else {
        scheduler.initialize().then(() => {
            scheduler.startScheduler();
        }).catch(error => {
            console.error('❌ Scheduler failed to start:', error);
            process.exit(1);
        });
    }
}

export default scheduler;
