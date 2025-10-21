import pkg from 'pg';
const { Client } = pkg;
import axios from 'axios';
import cron from 'node-cron';

class SarathiTestingScheduler {
    constructor() {
        this.dbClient = new Client({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        });
        
        this.templateSchedule = [
            { 
                day: 1, 
                template: 'problem_solver_english', 
                id: '1203964201590524', 
                language: 'english', 
                category: 'problem_solver',
                image: 'https://raw.githubusercontent.com/Siddharth748/sarthi-ai-bot/main/data/Gemini_Generated_Image_qjixf0qjixf0qjix.png'
            },
            { 
                day: 2, 
                template: 'daily_wisdom_english', 
                id: '748634401541350', 
                language: 'english', 
                category: 'daily_wisdom',
                image: 'https://raw.githubusercontent.com/Siddharth748/sarthi-ai-bot/main/data/Gemini_Generated_Image_yccjv2yccjv2yccj-2.png'
            },
            { 
                day: 3, 
                template: 'emotional_check_in_english', 
                id: '1779815382653468', 
                language: 'english', 
                category: 'emotional_checkin',
                image: 'https://raw.githubusercontent.com/Siddharth748/sarthi-ai-bot/main/data/Gemini_Generated_Image_yccjv2yccjv2yccj-4.png'
            },
            { 
                day: 4, 
                template: 'problem_solver_hindi', 
                id: '2038691776889448', 
                language: 'hindi', 
                category: 'problem_solver',
                image: 'https://raw.githubusercontent.com/Siddharth748/sarthi-ai-bot/main/data/Gemini_Generated_Image_yccjv2yccjv2yccj-5.png'
            },
            { 
                day: 5, 
                template: 'daily_wisdom_hindi', 
                id: '1918171358731282', 
                language: 'hindi', 
                category: 'daily_wisdom',
                image: 'https://raw.githubusercontent.com/Siddharth748/sarthi-ai-bot/main/data/Gemini_Generated_Image_yccjv2yccjv2yccj-6.png'
            },
            { 
                day: 6, 
                template: 'emotional_checkin_hindi', 
                id: '1362219698629498', 
                language: 'hindi', 
                category: 'emotional_checkin',
                image: 'https://raw.githubusercontent.com/Siddharth748/sarthi-ai-bot/main/data/Gemini_Generated_Image_yccjv2yccjv2yccj.png'
            }
        ];
    }

    async initialize() {
        await this.dbClient.connect();
        console.log('✅ Sarathi Testing Scheduler Initialized');
    }

    async loadAllUsersFromDatabase() {
        try {
            const query = `
                SELECT phone_number, language, name 
                FROM users 
                WHERE phone_number IS NOT NULL 
                AND phone_number != ''
            `;
            const result = await this.dbClient.query(query);
            
            console.log(`📊 Loaded ${result.rows.length} users from database`);
            return result.rows;
            
        } catch (error) {
            console.error('❌ Failed to load users from database:', error.message);
            return [];
        }
    }

    getCurrentDayTemplate() {
        const dayOfCycle = (Math.floor(Date.now() / (24 * 60 * 60 * 1000)) % 6) + 1;
        return this.templateSchedule.find(t => t.day === dayOfCycle);
    }

    async sendMorningMessage(user, template) {
        const messageId = `msg_${Date.now()}_${user.phone_number.replace('+', '')}`;
        
        try {
            console.log(`📤 Attempting to send ${template.template} to ${user.phone_number}`);
            
            // Send via WhatsApp API
            const response = await axios.post(
                `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
                {
                    messaging_product: "whatsapp",
                    to: user.phone_number,
                    type: "template",
                    template: {
                        name: template.template,
                        language: { code: template.language },
                        components: [
                            {
                                type: "header",
                                parameters: [
                                    {
                                        type: "image",
                                        image: { link: template.image }
                                    }
                                ]
                            },
                            {
                                type: "body",
                                parameters: [
                                    { type: "text", text: user.name || "User" }
                                ]
                            }
                        ]
                    }
                },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            // Log message sent
            await this.logMessageSent(messageId, user.phone_number, template, response.data);

            console.log(`✅ Sent ${template.template} to ${user.phone_number}`);
            return true;

        } catch (error) {
            console.error(`❌ Failed to send to ${user.phone_number}:`, error.response?.data || error.message);
            await this.logMessageSent(messageId, user.phone_number, template, null, 'failed');
            return false;
        }
    }

    async logMessageSent(messageId, phone, template, apiResponse = null, status = 'sent') {
        try {
            const query = `
                INSERT INTO morning_messages_sent 
                (message_id, phone, template_id, template_name, sent_time, delivery_status, language, category)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `;
            
            await this.dbClient.query(query, [
                messageId,
                phone,
                template.id,
                template.template,
                new Date(),
                status,
                template.language,
                template.category
            ]);

            await this.updateTemplatePerformance(template, status === 'sent');
        } catch (error) {
            console.log('⚠️  Could not log to database:', error.message);
        }
    }

    async updateTemplatePerformance(template, success) {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            const checkQuery = `
                SELECT performance_id FROM template_performance 
                WHERE template_id = $1 AND send_date = $2
            `;
            const result = await this.dbClient.query(checkQuery, [template.id, today]);

            if (result.rows.length === 0) {
                const insertQuery = `
                    INSERT INTO template_performance 
                    (performance_id, template_id, template_name, send_date, send_count, 
                     delivery_count, language, category)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `;
                await this.dbClient.query(insertQuery, [
                    `perf_${Date.now()}`,
                    template.id,
                    template.template,
                    today,
                    success ? 1 : 0,
                    success ? 1 : 0,
                    template.language,
                    template.category
                ]);
            } else {
                const updateQuery = `
                    UPDATE template_performance 
                    SET send_count = send_count + $1,
                        delivery_count = delivery_count + $2,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE template_id = $3 AND send_date = $4
                `;
                await this.dbClient.query(updateQuery, [
                    success ? 1 : 0,
                    success ? 1 : 0,
                    template.id,
                    today
                ]);
            }
        } catch (error) {
            console.log('⚠️  Could not update template performance:', error.message);
        }
    }

    async scheduleDailyMessages() {
        try {
            const currentTemplate = this.getCurrentDayTemplate();
            const allUsers = await this.loadAllUsersFromDatabase();

            console.log(`🎯 Day ${currentTemplate.day}: Using template ${currentTemplate.template}`);
            console.log(`🖼️  Image: ${currentTemplate.image}`);
            console.log(`👥 Total users in database: ${allUsers.length}`);

            if (allUsers.length === 0) {
                console.log('❌ No users found in database. Skipping message sending.');
                return { 
                    template: currentTemplate.template, 
                    day: currentTemplate.day,
                    language: currentTemplate.language,
                    sent: 0, 
                    total: 0,
                    error: 'No users found'
                };
            }

            console.log(`📤 Sending to ALL ${allUsers.length} users`);

            let sentCount = 0;
            let failedCount = 0;

            for (const user of allUsers) {
                const success = await this.sendMorningMessage(user, currentTemplate);
                if (success) {
                    sentCount++;
                } else {
                    failedCount++;
                }
                
                // Rate limiting - 1 message per second
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            console.log(`✅ Daily scheduling complete:`);
            console.log(`   📨 Sent: ${sentCount}`);
            console.log(`   ❌ Failed: ${failedCount}`);
            console.log(`   📊 Total: ${allUsers.length}`);

            return { 
                template: currentTemplate.template, 
                day: currentTemplate.day,
                language: currentTemplate.language,
                sent: sentCount, 
                failed: failedCount,
                total: allUsers.length,
                image: currentTemplate.image
            };
        } catch (error) {
            console.error('❌ Error in scheduleDailyMessages:', error);
            throw error;
        }
    }

    // Start the scheduler to run daily at 7:30 AM
    startScheduler() {
        console.log('⏰ Scheduling daily messages at 7:30 AM...');
        
        // Schedule for 7:30 AM every day
        cron.schedule('30 7 * * *', async () => {
            console.log('🕗 7:30 AM - Starting daily message sending...');
            try {
                await this.scheduleDailyMessages();
                console.log('✅ Daily messages completed successfully');
            } catch (error) {
                console.error('❌ Daily messages failed:', error);
            }
        });

        console.log('✅ Scheduler started. Messages will send daily at 7:30 AM');
        console.log('📅 Next run: Tomorrow 7:30 AM');
    }
}

// Create and export instance
const scheduler = new SarathiTestingScheduler();
export default scheduler;

// Auto-start if run directly, but only initialize (don't send messages immediately)
const isMainModule = process.argv[1] && process.argv[1].includes('scheduler.js');
if (isMainModule) {
    scheduler.initialize().then(async () => {
        console.log('🚀 Scheduler initialized successfully');
        console.log('⏰ Starting scheduled service (will run daily at 7:30 AM)');
        scheduler.startScheduler();
        
        // Keep the process alive
        console.log('💤 Process running in background, waiting for scheduled tasks...');
    }).catch(error => {
        console.error('❌ Scheduler failed to initialize:', error);
        process.exit(1);
    });
}
