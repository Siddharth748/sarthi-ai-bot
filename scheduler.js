import pkg from 'pg';
const { Client } = pkg;
import axios from 'axios';

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

        // Hardcoded test users - UPDATE THESE WITH REAL NUMBERS
        this.testUsers = [
            { phone: '+911234567890', language: 'english', name: 'Test User EN' },
            { phone: '+911234567891', language: 'hindi', name: 'Test User HI' }
        ];
    }

    async initialize() {
        try {
            await this.dbClient.connect();
            console.log('✅ Sarathi Testing Scheduler Initialized');
            
            // Try to load users from database if table exists
            await this.loadUsersFromDatabase();
        } catch (error) {
            console.log('⚠️  Using default test users (database not available)');
        }
    }

    async loadUsersFromDatabase() {
        try {
            const query = `
                SELECT phone, language, name 
                FROM users 
                WHERE active = true 
                AND phone IS NOT NULL
                LIMIT 10
            `;
            const result = await this.dbClient.query(query);
            
            if (result.rows.length > 0) {
                this.testUsers = result.rows;
                console.log(`📊 Loaded ${this.testUsers.length} users from database`);
            }
        } catch (error) {
            console.log('📋 Using default test users');
        }
    }

    getCurrentDayTemplate() {
        const dayOfCycle = (Math.floor(Date.now() / (24 * 60 * 60 * 1000)) % 6) + 1;
        return this.templateSchedule.find(t => t.day === dayOfCycle);
    }

    async sendMorningMessage(user, template) {
        const messageId = `msg_${Date.now()}_${user.phone.replace('+', '')}`;
        
        try {
            console.log(`📤 Attempting to send ${template.template} to ${user.phone}`);
            
            // Send via WhatsApp API
            const response = await axios.post(
                `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
                {
                    messaging_product: "whatsapp",
                    to: user.phone,
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
                        Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            // Log message sent
            await this.logMessageSent(messageId, user.phone, template, response.data);

            console.log(`✅ Sent ${template.template} to ${user.phone}`);
            return true;

        } catch (error) {
            console.error(`❌ Failed to send to ${user.phone}:`, error.response?.data || error.message);
            await this.logMessageSent(messageId, user.phone, template, null, 'failed');
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
        const currentTemplate = this.getCurrentDayTemplate();
        console.log(`🎯 Day ${currentTemplate.day}: Using template ${currentTemplate.template}`);
        console.log(`🖼️  Image: ${currentTemplate.image}`);

        const usersToMessage = this.testUsers.filter(user => 
            user.language === currentTemplate.language
        );

        if (usersToMessage.length === 0) {
            console.log('⚠️  No users found for this language, sending to all users');
            usersToMessage.push(...this.testUsers);
        }

        console.log(`📤 Sending to ${usersToMessage.length} users`);

        let sentCount = 0;
        for (const user of usersToMessage) {
            const success = await this.sendMorningMessage(user, currentTemplate);
            if (success) sentCount++;
            
            // Rate limiting - 1 message per second
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log(`✅ Daily scheduling complete: ${sentCount}/${usersToMessage.length} sent successfully`);
        return { 
            template: currentTemplate.template, 
            day: currentTemplate.day,
            language: currentTemplate.language,
            sent: sentCount, 
            total: usersToMessage.length,
            image: currentTemplate.image
        };
    }
}

// Create and export instance
const scheduler = new SarathiTestingScheduler();
export default scheduler;

// Auto-start if run directly
const isMainModule = process.argv[1] && process.argv[1].includes('scheduler.js');
if (isMainModule) {
    scheduler.initialize().then(async () => {
        console.log('🚀 Starting daily message scheduling...');
        const result = await scheduler.scheduleDailyMessages();
        console.log('📊 Daily Result:', result);
        process.exit(0);
    }).catch(error => {
        console.error('❌ Scheduler failed:', error);
        process.exit(1);
    });
}
