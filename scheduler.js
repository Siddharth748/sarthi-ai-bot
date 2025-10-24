// test-scheduler.js - Sarathi AI Single Number Test Scheduler
import pkg from 'pg';
const { Client } = pkg;
import axios from 'axios';

class SarathiTestScheduler {
    constructor() {
        this.dbConfig = {
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        };
        
        // Test Templates
        this.templates = [
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
            }
        ];

        this.heltarApiKey = process.env.HELTAR_API_KEY;
        this.heltarPhoneId = process.env.HELTAR_PHONE_ID;
        this.testNumber = '918427792857'; // 🎯 SPECIFIC TEST NUMBER
        
        console.log('✅ Sarathi Test Scheduler Initialized');
        console.log(`🎯 Testing with: ${this.testNumber}`);
    }

    async getDbClient() {
        const client = new Client(this.dbConfig);
        await client.connect();
        return client;
    }

    async initialize() {
        try {
            console.log('✅ Database connection initialized');
            await this.verifyWhatsAppCredentials();
        } catch (error) {
            console.error('❌ Test scheduler initialization failed:', error.message);
            throw error;
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

    getTemplateForDay(day) {
        return this.templates.find(t => t.day === day) || this.templates[0];
    }

    // CORRECT HELTAR API STRUCTURE
    createHeltarTemplatePayload(template) {
        const cleanPhone = this.testNumber.replace(/\D/g, '');
        
        const templatePayload = {
            name: template.template,
            language: {
                code: template.language_code,
                policy: "deterministic"
            }
        };

        const heltarPayload = {
            messages: [{
                clientWaNumber: cleanPhone,
                message: templatePayload,
                messageType: "template"
            }]
        };

        console.log('📨 HELTAR Payload:', JSON.stringify(heltarPayload, null, 2));
        return heltarPayload;
    }

    async sendTestMessage(template) {
        const messageId = `test_${Date.now()}_${this.testNumber}`;
        
        try {
            console.log(`\n🎯 SENDING TEST TO: ${this.testNumber}`);
            console.log(`📋 Template: ${template.template}`);
            console.log(`🌐 Language: ${template.language_code}`);
            
            const heltarPayload = this.createHeltarTemplatePayload(template);
            
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

            console.log('✅ API Response:', JSON.stringify(response.data, null, 2));
            
            await this.logTestMessage(messageId, template, response.data, 'sent');
            console.log('🎉 SUCCESS! Message sent successfully!');
            
            return { success: true, messageId, response: response.data };

        } catch (error) {
            console.error('❌ TEST FAILED:');
            console.error('Status:', error.response?.status);
            console.error('Error Data:', error.response?.data);
            console.error('Error Message:', error.message);
            
            await this.logTestMessage(messageId, template, null, 'failed');
            
            return { 
                success: false, 
                error: error.message,
                status: error.response?.status,
                data: error.response?.data
            };
        }
    }

    async logTestMessage(messageId, template, apiResponse, status) {
        const client = await this.getDbClient();
        try {
            await client.query(`
                INSERT INTO morning_messages_sent 
                (message_id, phone, template_id, template_name, sent_time, delivery_status, language, category)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [
                messageId,
                this.testNumber,
                template.id,
                template.template,
                new Date(),
                status,
                template.language,
                template.category
            ]);
            console.log('📊 Test message logged to database');
        } catch (error) {
            console.error('❌ Failed to log test message:', error.message);
        } finally {
            await client.end();
        }
    }

    async runSingleTest(day = 1) {
        try {
            console.log('🚀 STARTING SINGLE NUMBER TEST');
            console.log('=' .repeat(50));
            
            const template = this.getTemplateForDay(day);
            const result = await this.sendTestMessage(template);
            
            console.log('\n📋 TEST COMPLETE:');
            console.log('=' .repeat(50));
            console.log(`📞 Number: ${this.testNumber}`);
            console.log(`📋 Template: ${template.template}`);
            console.log(`✅ Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
            
            if (!result.success) {
                console.log(`❌ Error: ${result.error}`);
                console.log(`📊 Status Code: ${result.status}`);
            }
            
            return result;

        } catch (error) {
            console.error('❌ Test execution failed:', error);
            return { success: false, error: error.message };
        }
    }

    async runAllTemplatesTest() {
        console.log('🧪 RUNNING ALL TEMPLATES TEST');
        console.log('=' .repeat(50));
        
        const results = [];
        
        for (const template of this.templates) {
            console.log(`\n🔄 Testing Template ${template.day}/3: ${template.template}`);
            const result = await this.sendTestMessage(template);
            results.push({
                template: template.template,
                day: template.day,
                success: result.success,
                error: result.error
            });
            
            // Wait 5 seconds between tests
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
        
        console.log('\n📊 ALL TESTS COMPLETE:');
        console.log('=' .repeat(50));
        results.forEach(result => {
            console.log(`Day ${result.day}: ${result.template} - ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
        });
        
        return results;
    }
}

// Create test instance
const testScheduler = new SarathiTestScheduler();

// Command line execution
if (process.argv[1] && process.argv[1].includes('test-scheduler.js')) {
    testScheduler.initialize().then(async () => {
        if (process.argv.includes('--all')) {
            // Test all templates
            await testScheduler.runAllTemplatesTest();
        } else {
            // Test single template (default: day 1)
            const day = process.argv.find(arg => arg.startsWith('--day='))?.split('=')[1] || 1;
            await testScheduler.runSingleTest(parseInt(day));
        }
        process.exit(0);
    }).catch(error => {
        console.error('❌ Test scheduler failed:', error);
        process.exit(1);
    });
}

export default testScheduler;
