// fixed-scheduler.js - Correct HELTAR Structure
import pkg from 'pg';
const { Client } = pkg;
import axios from 'axios';

class FixedScheduler {
    constructor() {
        this.dbConfig = {
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        };

        this.heltarApiKey = process.env.HELTAR_API_KEY;
        this.heltarPhoneId = process.env.HELTAR_PHONE_ID;
        
        // Test numbers
        this.testNumbers = [
            { country_code: "91", whatsapp_number: "8427792857" },
            { country_code: "91", whatsapp_number: "7018122128" }
        ];
        
        console.log('✅ Fixed Scheduler Ready');
    }

    async getDbClient() {
        const client = new Client(this.dbConfig);
        await client.connect();
        return client;
    }

    // CORRECT HELTAR STRUCTURE - Based on common required fields
    createHeltarPayload(phone) {
        const payload = {
            campaign_name: "Sarathi AI Test Campaign", // Required field
            contacts: [{
                country_code: phone.country_code,
                phone_number: phone.whatsapp_number  // Might be phone_number instead of whatsapp_number
            }],
            template_name: "problem_solver_english",  // Required field
            language_code: "en",                      // Required field
            parameters: {}                            // Empty parameters object (required)
        };

        console.log('📨 HELTAR Payload:', JSON.stringify(payload, null, 2));
        return payload;
    }

    // ALTERNATIVE: Try with header image if needed
    createHeltarPayloadWithImage(phone) {
        const payload = {
            campaign_name: "Sarathi AI Test Campaign",
            contacts: [{
                country_code: phone.country_code,
                phone_number: phone.whatsapp_number
            }],
            template_name: "problem_solver_english",
            language_code: "en",
            parameters: {
                header: {
                    type: "image",
                    image: {
                        link: "https://raw.githubusercontent.com/Siddharth748/sarthi-ai-bot/main/data/Gemini_Generated_Image_yccjv2yccjv2yccj-6.png"
                    }
                },
                body: []  // Empty body parameters
            }
        };

        console.log('📨 HELTAR Payload (with image):', JSON.stringify(payload, null, 2));
        return payload;
    }

    // SIMPLEST: Try without any parameters first
    createHeltarSimplePayload(phone) {
        const payload = {
            campaign_name: "Sarathi AI Test Campaign",
            contacts: [{
                country_code: phone.country_code,
                phone_number: phone.whatsapp_number
            }],
            template_name: "problem_solver_english",
            language_code: "en"
            // No parameters at all
        };

        console.log('📨 HELTAR Simple Payload:', JSON.stringify(payload, null, 2));
        return payload;
    }

    async sendTestMessage(phone, payloadCreator, testName) {
        try {
            console.log(`\n🧪 ${testName}: ${phone.country_code}${phone.whatsapp_number}`);
            
            const payload = payloadCreator(phone);
            
            const response = await axios.post(
                `https://api.heltar.com/v1/campaigns/send`,
                payload,
                {
                    headers: {
                        'Authorization': `Bearer ${this.heltarApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            console.log(`✅ ${testName} SUCCESS!`);
            console.log('Response:', JSON.stringify(response.data, null, 2));
            
            return { success: true, data: response.data };

        } catch (error) {
            console.log(`❌ ${testName} FAILED:`, error.response?.data || error.message);
            return { 
                success: false, 
                error: error.message,
                data: error.response?.data
            };
        }
    }

    async runAllTests() {
        try {
            console.log('🚀 TESTING DIFFERENT HELTAR PAYLOAD STRUCTURES');
            console.log('=' .repeat(60));

            const testPhone = this.testNumbers[0]; // Test with first number only
            
            console.log(`📞 Testing with: ${testPhone.country_code}${testPhone.whatsapp_number}`);
            console.log('📋 Template: problem_solver_english');
            console.log('=' .repeat(60));

            // TEST 1: Simple structure (no parameters)
            console.log('\n1️⃣  TEST 1: Simple structure (no parameters)');
            const test1 = await this.sendTestMessage(
                testPhone, 
                this.createHeltarSimplePayload, 
                'SIMPLE'
            );

            if (test1.success) {
                console.log('🎉 SUCCESS with simple structure!');
                return test1;
            }

            // TEST 2: With empty parameters
            console.log('\n2️⃣  TEST 2: With empty parameters object');
            await new Promise(resolve => setTimeout(resolve, 2000));
            const test2 = await this.sendTestMessage(
                testPhone, 
                this.createHeltarPayload, 
                'EMPTY_PARAMS'
            );

            if (test2.success) {
                console.log('🎉 SUCCESS with empty parameters!');
                return test2;
            }

            // TEST 3: With header image
            console.log('\n3️⃣  TEST 3: With header image parameters');
            await new Promise(resolve => setTimeout(resolve, 2000));
            const test3 = await this.sendTestMessage(
                testPhone, 
                this.createHeltarPayloadWithImage, 
                'WITH_IMAGE'
            );

            if (test3.success) {
                console.log('🎉 SUCCESS with header image!');
                return test3;
            }

            // If all tests failed, show the exact error details
            console.log('\n❌ ALL TESTS FAILED');
            console.log('=' .repeat(60));
            console.log('Last error details:', JSON.stringify(test3.data, null, 2));
            
            return { success: false, error: 'All structure tests failed' };

        } catch (error) {
            console.error('💥 Test failed:', error);
            return { success: false, error: error.message };
        }
    }

    async logMessage(messageId, phone, template, apiResponse = null, status = 'sent') {
        const client = await this.getDbClient();
        try {
            await client.query(`
                INSERT INTO morning_messages_sent 
                (message_id, phone, template_id, template_name, sent_time, delivery_status, language, category)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [
                messageId,
                phone,
                '1203964201590524',
                template,
                new Date(),
                status,
                'english',
                'problem_solver'
            ]);
            console.log('📊 Message logged to database');
        } catch (error) {
            console.error('❌ Failed to log message:', error.message);
        } finally {
            await client.end();
        }
    }
}

// Run tests
const scheduler = new FixedScheduler();

scheduler.runAllTests()
    .then(result => {
        if (result.success) {
            console.log('\n🎉 FOUND WORKING STRUCTURE!');
            console.log('✨ You can now use this payload structure for all messages');
        } else {
            console.log('\n💡 Next steps:');
            console.log('1. Check HELTAR API documentation for exact payload structure');
            console.log('2. Verify template name is exactly correct');
            console.log('3. Check if template needs specific parameters');
        }
        process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
        console.error('💥 Test crashed:', error);
        process.exit(1);
    });
