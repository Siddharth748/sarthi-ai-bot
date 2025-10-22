// scheduler.js - Sarathi AI Template Testing Scheduler
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
        
        // 6-Day Template Rotation Schedule
        this.templateSchedule = [
            { 
                day: 1, 
                template: 'problem_solver_english', 
                id: '1203964201590524', 
                language: 'english', 
                category: 'problem_solver',
                image: 'https://raw.githubusercontent.com/Siddharth748/sarthi-ai-bot/main/data/Gemini_Generated_Image_yccjv2yccjv2yccj-4.png',
                variables: {
                    name: '{{1}}' // User's name will be inserted
                }
            },
            { 
                day: 2, 
                template: 'daily_wisdom_english', 
                id: '748634401541350', 
                language: 'english', 
                category: 'daily_wisdom',
                image: 'https://raw.githubusercontent.com/Siddharth748/sarthi-ai-bot/main/data/Gemini_Generated_Image_yccjv2yccjv2yccj.png',
                variables: {
                    verse: '{{1}}', // "Focus on your duty, not the results"
                    meaning: '{{2}}' // "Reduce anxiety by concentrating on actions within your control..."
                }
            },
            { 
                day: 3, 
                template: 'emotional_check_in_english', 
                id: '1779815382653468', 
                language: 'english', 
                category: 'emotional_checkin',
                image: 'https://raw.githubusercontent.com/Siddharth748/sarthi-ai-bot/main/data/Gemini_Generated_Image_yccjv2yccjv2yccj-5.png',
                variables: {
                    message: '{{1}}', // "Emotional Awareness: Take 30 seconds to check in with yourself..."
                    prompt: '{{2}}' // "Reply with one word about your mood to continue."
                }
            },
            { 
                day: 4, 
                template: 'problem_solver_hindi', 
                id: '2038691776889448', 
                language: 'hindi', 
                category: 'problem_solver',
                image: 'https://raw.githubusercontent.com/Siddharth748/sarthi-ai-bot/main/data/Gemini_Generated_Image_yccjv2yccjv2yccj-2.png',
                variables: {
                    name: '{{1}}' // User's name will be inserted
                }
            },
            { 
                day: 5, 
                template: 'daily_wisdom_hindi', 
                id: '1918171358731282', 
                language: 'hindi', 
                category: 'daily_wisdom',
                image: 'https://raw.githubusercontent.com/Siddharth748/sarthi-ai-bot/main/data/Gemini_Generated_Image_yccjv2yccjv2yccj-6.png',
                variables: {
                    verse: '{{1}}', // "कर्म करो, फल की चिंता छोड़ो"
                    meaning: '{{2}}' // "परिणामों की चिंता करने के बजाय अपने नियंत्रण में आने वाले कार्यों पर ध्यान केंद्रित करके चिंता कम करें"
                }
            },
            { 
                day: 6, 
                template: 'emotional_checkin_hindi', 
                id: '1362219698629498', 
                language: 'hindi', 
                category: 'emotional_checkin',
                image: 'https://raw.githubusercontent.com/Siddharth748/sarthi-ai-bot/main/data/Gemini_Generated_Image_qjixf0qjixf0qjix.png',
                variables: {
                    message: '{{1}}' // "भावनात्मक जागरूकता: 30 सेकंड के लिए खुद से जुड़ें..."
                }
            }
        ];

        this.heltarApiKey = process.env.HELTAR_API_KEY;
        this.heltarPhoneId = process.env.HELTAR_PHONE_ID;
        
        console.log('✅ Sarathi Testing Scheduler Initialized');
        console.log('📅 6-Day Template Rotation Ready');
    }

    async initialize() {
        try {
            await this.dbClient.connect();
            console.log('✅ Database connected for scheduler');
            
            // Verify WhatsApp credentials
            await this.verifyWhatsAppCredentials();
            
        } catch (error) {
            console.error('❌ Scheduler initialization failed:', error.message);
            throw error;
        }
    }

    async verifyWhatsAppCredentials() {
        if (!this.heltarApiKey || !this.heltarPhoneId) {
            console.log('❌ HELTAR credentials missing - scheduler will not send messages');
            console.log('📝 Please set HELTAR_API_KEY and HELTAR_PHONE_ID environment variables');
            return false;
        }
        
        console.log('✅ HELTAR credentials verified');
        return true;
    }

    async loadAllSubscribedUsers() {
        try {
            const query = `
                SELECT phone_number, name, language 
                FROM users 
                WHERE subscribed_daily = true 
                AND phone_number IS NOT NULL 
                AND phone_number != ''
            `;
            
            const result = await this.dbClient.query(query);
            console.log(`📊 Loaded ${result.rows.length} subscribed users from database`);
            return result.rows;
            
        } catch (error) {
            console.error('❌ Failed to load users:', error.message);
            return [];
        }
    }

    getCurrentDayTemplate() {
        // Calculate day of cycle (1-6) based on current date
        const startDate = new Date('2024-01-01'); // Arbitrary start date for cycle
        const currentDate = new Date();
        const diffTime = currentDate - startDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const dayOfCycle = (diffDays % 6) + 1;
        
        const template = this.templateSchedule.find(t => t.day === dayOfCycle);
        console.log(`📅 Day ${dayOfCycle}: Using template ${template.template}`);
        return template;
    }

    getTemplateVariables(template, user) {
        // Pre-filled template variables based on your content
        const variableMap = {
            'daily_wisdom_english': {
                '{{1}}': "Focus on your duty, not the results",
                '{{2}}': "Reduce anxiety by concentrating on actions within your control rather than worrying about outcomes"
            },
            'daily_wisdom_hindi': {
                '{{1}}': "कर्म करो, फल की चिंता छोड़ो",
                '{{2}}': "परिणामों की चिंता करने के बजाय अपने नियंत्रण में आने वाले कार्यों पर ध्यान केंद्रित करके चिंता कम करें"
            },
            'emotional_check_in_english': {
                '{{1}}': "Emotional Awareness: Take 30 seconds to check in with yourself. Notice your current mood without judgment, then choose one word to describe how you feel right now.",
                '{{2}}': "Reply with one word about your mood to continue."
            },
            'emotional_checkin_hindi': {
                '{{1}}': "भावनात्मक जागरूकता: 30 सेकंड के लिए खुद से जुड़ें। बिना आलोचना के अपनी वर्तमान भावना को महसूस करें, फिर एक शब्द चुनें जो बताए आप अभी कैसा महसूस कर रहे हैं।"
            },
            'problem_solver_english': {
                '{{1}}': user.name || "User"
            },
            'problem_solver_hindi': {
                '{{1}}': user.name || "User"
            }
        };

        return variableMap[template.template] || {};
    }

    async sendTemplateMessage(user, template) {
        const messageId = `msg_${Date.now()}_${user.phone_number.replace('+', '')}`;
        
        try {
            console.log(`📤 Attempting to send ${template.template} to ${user.phone_number}`);
            
            // Get template variables
            const variables = this.getTemplateVariables(template, user);
            
            // Prepare components based on template type
            let components = [];
            
            // Header with image for all templates
            components.push({
                type: "header",
                parameters: [
                    {
                        type: "image",
                        image: { 
                            link: template.image 
                        }
                    }
                ]
            });

            // Body parameters based on template variables
            let bodyParameters = [];
            
            if (template.template.includes('problem_solver')) {
                // Problem solver templates use name parameter
                bodyParameters.push({
                    type: "text",
                    text: variables['{{1}}'] || user.name || "User"
                });
            } else if (template.template.includes('daily_wisdom')) {
                // Daily wisdom templates use verse and meaning
                bodyParameters.push({
                    type: "text",
                    text: variables['{{1}}'] || "Gita wisdom"
                });
                bodyParameters.push({
                    type: "text", 
                    text: variables['{{2}}'] || "Practical application"
                });
            } else if (template.template.includes('emotional_check')) {
                // Emotional check-in templates
                bodyParameters.push({
                    type: "text",
                    text: variables['{{1}}'] || "Emotional awareness message"
                });
                if (variables['{{2}}']) {
                    bodyParameters.push({
                        type: "text",
                        text: variables['{{2}}']
                    });
                }
            }

            if (bodyParameters.length > 0) {
                components.push({
                    type: "body",
                    parameters: bodyParameters
                });
            }

            // Send via HELTAR API
            const response = await axios.post(
                `https://api.heltar.com/v1/messages/send`,
                {
                    messages: [{
                        clientWaNumber: user.phone_number,
                        message: JSON.stringify({
                            type: "template",
                            template: {
                                name: template.template,
                                language: {
                                    code: template.language,
                                    policy: "deterministic"
                                },
                                components: components
                            }
                        }),
                        messageType: "template"
                    }]
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.heltarApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            // Log successful message sent
            await this.logMessageSent(messageId, user.phone_number, template, response.data);

            console.log(`✅ Sent ${template.template} to ${user.phone_number}`);
            return { success: true, messageId };

        } catch (error) {
            console.error(`❌ Failed to send to ${user.phone_number}:`, error.response?.data || error.message);
            
            // Log failed message
            await this.logMessageSent(messageId, user.phone_number, template, null, 'failed');
            
            return { success: false, error: error.message };
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

            // Update template performance
            await this.updateTemplatePerformance(template, status === 'sent');

            console.log(`📊 Logged message ${messageId} for template ${template.template}`);

        } catch (error) {
            console.error('❌ Failed to log message:', error.message);
        }
    }

    async updateTemplatePerformance(template, success) {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            // Check if record exists for today
            const checkQuery = `
                SELECT performance_id FROM template_performance 
                WHERE template_id = $1 AND send_date = $2
            `;
            const result = await this.dbClient.query(checkQuery, [template.id, today]);

            if (result.rows.length === 0) {
                // Create new record
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
                // Update existing record
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
            console.error('❌ Failed to update template performance:', error.message);
        }
    }

    async scheduleDailyMessages() {
        try {
            console.log('🚀 Starting daily message scheduling...');
            
            // Get current template for today
            const currentTemplate = this.getCurrentDayTemplate();
            
            // Load ALL subscribed users
            const allUsers = await this.loadAllSubscribedUsers();
            
            if (allUsers.length === 0) {
                console.log('❌ No subscribed users found. Skipping message sending.');
                return {
                    success: false,
                    error: 'No subscribed users',
                    template: currentTemplate.template,
                    sent: 0,
                    total: 0
                };
            }

            console.log(`🎯 Template: ${currentTemplate.template}`);
            console.log(`🖼️  Image: ${currentTemplate.image}`);
            console.log(`👥 Sending to: ${allUsers.length} users`);
            console.log('⏰ Starting at 7:30 AM IST...');

            let sentCount = 0;
            let failedCount = 0;
            const results = [];

            // Send to all users (no language filtering during testing)
            for (const user of allUsers) {
                const result = await this.sendTemplateMessage(user, currentTemplate);
                results.push({
                    phone: user.phone_number,
                    success: result.success,
                    messageId: result.messageId
                });

                if (result.success) {
                    sentCount++;
                } else {
                    failedCount++;
                }
                
                // Rate limiting: 1 message per second to avoid hitting limits
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Generate comprehensive report
            const report = {
                date: new Date().toISOString().split('T')[0],
                template: currentTemplate.template,
                template_id: currentTemplate.id,
                language: currentTemplate.language,
                category: currentTemplate.category,
                total_users: allUsers.length,
                sent_successfully: sentCount,
                failed: failedCount,
                success_rate: ((sentCount / allUsers.length) * 100).toFixed(2) + '%'
            };

            console.log('✅ Daily scheduling complete:');
            console.log(`   📨 Sent: ${sentCount}`);
            console.log(`   ❌ Failed: ${failedCount}`);
            console.log(`   📊 Total: ${allUsers.length}`);
            console.log(`   📈 Success Rate: ${report.success_rate}`);

            // Log the report
            await this.logDailyReport(report);

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
        try {
            const query = `
                INSERT INTO ab_test_results 
                (test_id, test_date, template_a_id, template_b_id, template_a_engagement, sample_size)
                VALUES ($1, $2, $3, $4, $5, $6)
            `;
            
            await this.dbClient.query(query, [
                `test_${Date.now()}`,
                report.date,
                report.template_id,
                'daily_performance',
                parseFloat(report.success_rate),
                report.total_users
            ]);
            
            console.log('📊 Daily report logged to analytics');
        } catch (error) {
            console.error('❌ Failed to log daily report:', error.message);
        }
    }

    // Convert IST to UTC for cron scheduling
    getISTCronTime() {
        // 7:30 AM IST = 2:00 AM UTC (IST is UTC+5:30)
        return '0 2 * * *'; // 2:00 AM UTC = 7:30 AM IST
    }

    // Start the scheduler to run daily at 7:30 AM IST
    startScheduler() {
        const istCronTime = this.getISTCronTime();
        
        console.log('⏰ Scheduling daily messages at 7:30 AM IST...');
        console.log(`📅 Cron expression: ${istCronTime} (2:00 AM UTC = 7:30 AM IST)`);
        
        // Schedule for 7:30 AM IST every day
        cron.schedule(istCronTime, async () => {
            console.log('🕗 7:30 AM IST - Starting daily message sending...');
            console.log('📍 Timezone: IST (UTC+5:30)');
            
            try {
                const report = await this.scheduleDailyMessages();
                console.log('✅ Daily messages completed successfully');
                console.log('📋 Report:', report);
            } catch (error) {
                console.error('❌ Daily messages failed:', error);
            }
        });

        // Also schedule a test run immediately if needed (for testing)
        if (process.env.RUN_TEST_SCHEDULE === 'true') {
            console.log('🧪 Test mode: Scheduling test run in 1 minute...');
            cron.schedule('*/1 * * * *', async () => { // Every minute
                console.log('🧪 Test run triggered');
                await this.scheduleDailyMessages();
            }, { scheduled: false }).start();
        }

        console.log('✅ Scheduler started successfully');
        console.log('📅 Next run: Tomorrow 7:30 AM IST');
        console.log('👥 Sending to: ALL subscribed users (no language filtering)');
        console.log('🔄 Template rotation: 6-day cycle');
        console.log('💤 Process running in background, waiting for scheduled tasks...');
    }

    // Manual trigger for testing
    async manualTrigger() {
        console.log('🔧 Manual trigger activated');
        return await this.scheduleDailyMessages();
    }
}

// Create and export instance
const scheduler = new SarathiTestingScheduler();
export default scheduler;

// Auto-start if run directly
const isMainModule = process.argv[1] && process.argv[1].includes('scheduler.js');
if (isMainModule) {
    scheduler.initialize().then(async () => {
        console.log('🚀 Scheduler initialized successfully');
        
        // Check if manual trigger is requested
        if (process.argv.includes('--manual') || process.argv.includes('--test')) {
            console.log('🔧 Running manual test...');
            const result = await scheduler.manualTrigger();
            console.log('📋 Manual test result:', result);
            process.exit(0);
        } else {
            // Start the scheduled service
            scheduler.startScheduler();
            console.log('💤 Process running in background...');
        }
        
    }).catch(error => {
        console.error('❌ Scheduler failed to initialize:', error);
        process.exit(1);
    });
}
