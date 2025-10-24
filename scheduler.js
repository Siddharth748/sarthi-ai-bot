// image-header-scheduler.js - Correct Image Header Structure
import pkg from 'pg';
const { Client } = pkg;
import axios from 'axios';

class ImageHeaderScheduler {
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
        
        console.log('✅ Image Header Scheduler Ready');
    }

    async getDbClient() {
        const client = new Client(this.dbConfig);
        await client.connect();
        return client;
    }

    // CORRECT STRUCTURE WITH IMAGE HEADER
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

        console.log('📨 HELTAR Payload (with image header):', JSON.stringify(payload, null, 2));
        return payload;
    }

    // ALTERNATIVE: Try without any components first
    createHeltarSimplePayload(phone) {
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
                    }
                    // No components at all
                },
                messageType: "template"
            }]
        };

        console.log('📨 HELTAR Simple Payload (no components):', JSON.stringify(payload, null, 2));
        return payload;
    }

    // TEST: Try with different image URL (maybe GitHub raw URL issue)
    createHeltarPayloadWithCDNImage(phone) {
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
                                        // Try a different image URL that's definitely accessible
                                        link: "https://images.unsplash.com/photo-1541963463532-d68292c34b19?w=400"
                                    }
                                }
                            ]
                        }
                    ]
                },
                messageType: "template"
            }]
        };

        console.log('📨 HELTAR Payload (with CDN image):', JSON.stringify(payload, null, 2));
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
            console.log(`❌ ${testName} FAILED:`);
            console.log('Error:', error.response?.data?.error || error.message);
            console.log('Details:', error.response?.data?.error_data?.details);
            
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
                details: error.response?.data?.error_data?.details,
                data: error.response?.data
            };
        }
    }

    async runTests() {
        try {
            console.log('🚀 TESTING IMAGE HEADER STRUCTURES');
            console.log('=' .repeat(60));
            console.log('📞 Test Numbers:', this.testNumbers.map(p => `${p.country_code}${p.whatsapp_number}`).join(', '));
            console.log('📋 Template: problem_solver_english');
            console.log('🖼️  Template expects: IMAGE header');
            console.log('=' .repeat(60));

            const testPhone = this.testNumbers[0];
            
            // TEST 1: Try without any components (see if template works without header)
            console.log('\n1️⃣  TEST 1: No components (check if template works without header)');
            const test1 = await this.sendTestMessage(
                testPhone, 
                this.createHeltarSimplePayload, 
                'NO_COMPONENTS'
            );

            if (test1.success) {
                console.log('🎉 SUCCESS! Template works without header components');
                return test1;
            }

            // TEST 2: With image header (GitHub URL)
            console.log('\n2️⃣  TEST 2: With image header (GitHub URL)');
            await new Promise(resolve => setTimeout(resolve, 2000));
            const test2 = await this.sendTestMessage(
                testPhone, 
                this.createHeltarPayloadWithImage, 
                'GITHUB_IMAGE'
            );

            if (test2.success) {
                console.log('🎉 SUCCESS with GitHub image!');
                return test2;
            }

            // TEST 3: With different image URL (CDN)
            console.log('\n3️⃣  TEST 3: With different image (CDN URL)');
            await new Promise(resolve => setTimeout(resolve, 2000));
            const test3 = await this.sendTestMessage(
                testPhone, 
                this.createHeltarPayloadWithCDNImage, 
                'CDN_IMAGE'
            );

            if (test3.success) {
                console.log('🎉 SUCCESS with CDN image!');
                return test3;
            }

            console.log('\n❌ ALL IMAGE TESTS FAILED');
            console.log('💡 Possible issues:');
            console.log('   - Image URL not accessible by WhatsApp servers');
            console.log('   - Template might need specific image dimensions/format');
            console.log('   - Check template configuration in WhatsApp Business Manager');
            
            return { success: false, error: 'All image header tests failed' };

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
const scheduler = new ImageHeaderScheduler();

scheduler.runTests()
    .then(result => {
        if (result.success) {
            console.log('\n🎉 IMAGE HEADER ISSUE SOLVED!');
            console.log('✨ Use the working structure for all future messages');
        } else {
            console.log('\n🔧 Next steps:');
            console.log('1. Check if GitHub raw image URL is accessible publicly');
            console.log('2. Verify image meets WhatsApp requirements (format, size)');
            console.log('3. Try uploading image to a CDN service');
            console.log('4. Check template configuration in Meta Business Suite');
        }
        process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
        console.error('💥 Test crashed:', error);
        process.exit(1);
    });
