const { Client } = require('pg');
const axios = require('axios');
const csv = require('csv-parser');
const fs = require('fs');

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

        this.testUsers = [];
    }

    async initialize() {
        await this.dbClient.connect();
        await this.loadTestUsers();
        console.log('✅ Sarathi Testing Scheduler Initialized');
    }

    async loadTestUsers() {
        return new Promise((resolve) => {
            fs.createReadStream('test_users.csv')
                .pipe(csv())
                .on('data', (row) => {
                    if (row.phone && row.language) {
                        this.testUsers.push({
                            phone: row.phone,
                            language: row.language,
                            name: row.name || ''
                        });
                    }
                })
                .on('end', () => {
                    console.log(`📊 Loaded ${this.testUsers.length} test users`);
                    resolve();
                })
                .on('error', () => {
                    // Fallback to default test users
                    this.testUsers = [
                        { phone: '+91XXXXXXXXXX', language: 'english', name: 'Test User EN' },
                        { phone: '+91YYYYYYYYYY', language: 'hindi', name: 'Test User HI' }
                    ];
                    console.log('📋 Using default test users');
                    resolve();
                });
        });
    }

    getCurrentDayTemplate() {
        const dayOfCycle = (Math.floor(Date.now() / (24 * 60 * 60 * 1000)) % 6) + 1;
        return this.templateSchedule.find(t => t.day === dayOfCycle);
    }

    async sendMorningMessage(user, template) {
        const messageId = `msg_${Date.now()}_${user.phone.replace('+', '')}`;
        
        try {
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

        // Update template performance
        await this.updateTemplatePerformance(template, status === 'sent');
    }

    async updateTemplatePerformance(template, success) {
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
    }

    async scheduleDailyMessages() {
        const currentTemplate = this.getCurrentDayTemplate();
        console.log(`🎯 Day ${currentTemplate.day}: Using template ${currentTemplate.template}`);
        console.log(`🖼️  Image: ${currentTemplate.image}`);

        const usersToMessage = this.testUsers.filter(user => 
            user.language === currentTemplate.language
        );

        console.log(`📤 Sending to ${usersToMessage.length} ${currentTemplate.language} users`);

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

    async getWeeklyReport() {
        const query = `
            SELECT 
                template_name,
                language,
                SUM(send_count) as total_sent,
                SUM(delivery_count) as total_delivered,
                SUM(reply_count) as total_replies,
                ROUND((SUM(reply_count)::FLOAT / NULLIF(SUM(delivery_count), 0)) * 100, 2) as overall_reply_rate,
                AVG(avg_engagement_score) as avg_engagement
            FROM template_performance 
            WHERE send_date >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY template_name, language
            ORDER BY overall_reply_rate DESC
        `;
        
        const result = await this.dbClient.query(query);
        return result.rows;
    }
}

// Export singleton instance
module.exports = new SarathiTestingScheduler();

// Auto-start if run directly
if (require.main === module) {
    const scheduler = new SarathiTestingScheduler();
    
    scheduler.initialize().then(async () => {
        console.log('🚀 Starting daily message scheduling...');
        const result = await scheduler.scheduleDailyMessages();
        console.log('📊 Daily Result:', result);
        
        const report = await scheduler.getWeeklyReport();
        console.log('📈 Weekly Report:', report);
        
        process.exit(0);
    }).catch(error => {
        console.error('❌ Scheduler failed:', error);
        process.exit(1);
    });
}
