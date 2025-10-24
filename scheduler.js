// scheduler.js - TEST VERSION (Single Number Only)
import pkg from 'pg';
const { Client } = pkg;
import axios from 'axios';

class SarathiTestScheduler {
    constructor() {
        this.dbConfig = {
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        };
        
        this.templates = [
            { 
                template: 'problem_solver_english', 
                id: '1203964201590524', 
                language_code: 'en'
            },
            { 
                template: 'daily_wisdom_english', 
                id: '748634401541350', 
                language_code: 'en'
            },
            { 
                template: 'emotional_check_in_english', 
                id: '1779815382653468', 
                language_code: 'en'
            }
        ];

        this.heltarApiKey = process.env.HELTAR_API_KEY;
        this.heltarPhoneId = process.env.HELTAR_PHONE_ID;
        this.testNumber = '918427792857'; // 🎯 TEST NUMBER
        
        console.log('✅ Test Scheduler Ready');
        console.log(`🎯 Testing with: ${this.testNumber}`);
    }

    async getDbClient() {
        const client = new Client(this.dbConfig);
        await client.connect();
        return client;
    }

    createHeltarPayload(template) {
        const cleanPhone = this.testNumber.replace(/\D/g, '');
        
        return {
            messages: [{
                clientWaNumber: cleanPhone,
                message: {
                    name: template.template,
                    language: {
                        code: template.language_code,
                        policy: "deterministic"
                    }
                },
                messageType: "template"
            }]
        };
    }

    async sendTestMessage(template) {
        try {
            console.log(`\n🎯 SENDING TO: ${this.testNumber}`);
            console.log(`📋 Template: ${template.template}`);
            
            const payload = this.createHeltarPayload(template);
            console.log('📨 Payload:', JSON.stringify(payload, null, 2));
            
            const response = await axios.post(
                `https://api.heltar.com/v1/messages/send`,
                payload,
                {
                    headers: {
                        'Authorization': `Bearer ${this.heltarApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            console.log('✅ SUCCESS! Response:', JSON.stringify(response.data, null, 2));
            return { success: true, data: response.data };

        } catch (error) {
            console.error('❌ FAILED:');
            console.error('Status:', error.response?.status);
            console.error('Error:', error.response?.data || error.message);
            return { success: false, error: error.response?.data || error.message };
        }
    }

    async runTest() {
        try {
            console.log('🚀 STARTING TEST...');
            
            // Test with first template
            const template = this.templates[0];
            const result = await this.sendTestMessage(template);
            
            console.log('\n📋 TEST RESULT:');
            console.log(result.success ? '🎉 SUCCESS!' : '❌ FAILED!');
            
            return result;

        } catch (error) {
            console.error('❌ Test failed:', error);
            return { success: false, error: error.message };
        }
    }
}

// Run immediately
const testScheduler = new SarathiTestScheduler();

testScheduler.runTest()
    .then(result => {
        console.log('\n✨ Test completed');
        process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
        console.error('💥 Test crashed:', error);
        process.exit(1);
    });
