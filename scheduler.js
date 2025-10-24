// correct-scheduler.js - Exact HELTAR Structure from Zod Error
import pkg from 'pg';
const { Client } = pkg;
import axios from 'axios';

class CorrectScheduler {
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
        
        console.log('✅ Correct Scheduler Ready');
    }

    async getDbClient() {
        const client = new Client(this.dbConfig);
        await client.connect();
        return client;
    }

    // EXACT STRUCTURE FROM ZOD ERROR
    createHeltarPayload(phone) {
        const fullNumber = phone.country_code + phone.whatsapp_number;
        
        const payload = {
            campaignName: "Sarathi AI Test Campaign", // camelCase
            templateName: "problem_solver_english",   // camelCase  
            languageCode: "en",                       // camelCase
            messages: [{                              // array, not contacts
                clientWaNumber: fullNumber,           // full number without +
                message: {
                    name: "problem_solver_english",
                    language: {
                        code: "en",
                        policy: "deterministic"
                    }
                },
                messageType: "template"
            }]
        };

        console.log('📨 EXACT HELTAR Payload:', JSON.stringify(payload, null, 2));
        return payload;
    }

    // ALTERNATIVE: With header image
    createHeltarPayloadWithImage(phone) {
        const fullNumber = phone.country_code + phone.whatsapp_number;
        
        const payload = {
            campaignName: "Sarathi AI Test Campaign",
            templateName: "problem_solver_english", 
            languageCode: "en",
            messages: [{
                clientWaNumber: fullNumber,
                message: {
                    name: "problem_solver_english",
                    language: {
                        code: "en",
                        policy: "deterministic"
                    },
                    components: [
                        {
                            type: "header",
                            parameters: [
                                {
                                    type: "image", 
                                    image: {
                                        link: "https://raw.githubusercontent.com/Siddharth748/sarthi-ai-bot/main/data/Gemini_Generated_Image_yccjv2yccjv2yccj-6.png"
                                    }
                                }
                            ]
                        }
                    ]
                },
                messageType: "template"
            }]
        };

        console.log('📨 HELTAR Payload (with image):', JSON.stringify(payload, null, 2));
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
            
            await this.logMessage(
                `success_${Date.now()}_${phone.whatsapp_number}`,
                `${phone.country_code}${phone.whatsapp_number}`,
                'problem_solver_english',
                response.data
            );
            
            return { success: true, data: response.data };

        } catch (error) {
            console.log(`❌ ${testName} FAILED:`, error.response?.data || error.message);
            
            await this.logMessage(
                `failed_${Date.now()}_${phone.whatsapp_number}`,
                `${phone.country_code}${phone.whatsapp_number}`,
                'problem_solver_english',
                null,
                'failed'
            );
            
            return { 
                success: false, 
                error: error.message,
                data: error.response?.data
            };
        }
    }

    async runTests() {
        try {
            console.log('🚀 TESTING EXACT HELTAR STRUCTURE');
            console.log('=' .repeat(60));
            console.log('📞 Test Numbers:', this.testNumbers.map(p => `${p.country_code}${p.whatsapp_number}`).join(', '));
            console.log('📋 Template: problem_solver_english');
            console.log('=' .repeat(60));

            const testPhone = this.testNumbers[0];
            
            // TEST 1: Basic structure (camelCase fields + messages array)
            console.log('\n1️⃣  TEST 1: Basic structure (camelCase + messages array)');
            const test1 = await this.sendTestMessage(
                testPhone, 
                this.createHeltarPayload, 
                'BASIC_STRUCTURE'
            );

            if (test1.success) {
                console.log('🎉 SUCCESS with basic structure!');
                
                // Send to second number if first worked
                console.log('\n📍 Sending to second number...');
                const testPhone2 = this.testNumbers[1];
                await this.sendTestMessage(testPhone2, this.createHeltarPayload, 'SECOND_NUMBER');
                
                return test1;
            }

            // TEST 2: With header image
            console.log('\n2️⃣  TEST 2: With header image components');
            await new Promise(resolve => setTimeout(resolve, 2000));
            const test2 = await this.sendTestMessage(
                testPhone, 
                this.createHeltarPayloadWithImage, 
                'WITH_IMAGE'
            );

            if (test2.success) {
                console.log('🎉 SUCCESS with header image!');
                return test2;
            }

            console.log('\n❌ BOTH TESTS FAILED');
            console.log('Last error details:', JSON.stringify(test2.data, null, 2));
            
            return { success: false, error: 'Both structure tests failed' };

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
const scheduler = new CorrectScheduler();

scheduler.runTests()
    .then(result => {
        if (result.success) {
            console.log('\n🎉 HELTAR INTEGRATION SUCCESSFUL!');
            console.log('✨ You can now use this exact structure for all messages');
        } else {
            console.log('\n💡 Check:');
            console.log('1. Verify template name exactly matches in WhatsApp Business Manager');
            console.log('2. Check if template needs specific body parameters');
            console.log('3. Confirm WhatsApp Business Account is active');
        }
        process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
        console.error('💥 Test crashed:', error);
        process.exit(1);
    });
