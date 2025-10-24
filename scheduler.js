// simple-template-test.js - Send without header first
import pkg from 'pg';
const { Client } = pkg;
import axios from 'axios';

class SimpleTemplateScheduler {
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
        
        console.log('✅ Simple Template Scheduler Ready');
    }

    async getDbClient() {
        const client = new Client(this.dbConfig);
        await client.connect();
        return client;
    }

    // SIMPLE: No header, no components
    createSimplePayload(phone) {
        const fullNumber = phone.country_code + phone.whatsapp_number;
        
        const payload = {
            campaignName: "Sarathi AI Day 1 Test",
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
                    // NO COMPONENTS - header is optional
                },
                messageType: "template"
            }]
        };

        console.log('📨 Simple Payload (no header):', JSON.stringify(payload, null, 2));
        return payload;
    }

    // WITH BODY: Only body parameters if template needs them
    createWithBodyPayload(phone) {
        const fullNumber = phone.country_code + phone.whatsapp_number;
        
        const payload = {
            campaignName: "Sarathi AI Day 1 Test",
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
                            type: "body",
                            parameters: [
                                {
                                    type: "text",
                                    text: "User" // Common placeholder for user name
                                }
                            ]
                        }
                    ]
                },
                messageType: "template"
            }]
        };

        console.log('📨 With Body Payload:', JSON.stringify(payload, null, 2));
        return payload;
    }

    async sendTestMessage(phone, payloadCreator, testName) {
        try {
            console.log(`\n🎯 SENDING TO: ${phone.country_code}${phone.whatsapp_number}`);
            console.log(`🧪 Test: ${testName}`);
            
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

            console.log(`✅ SUCCESS! Message sent to ${phone.country_code}${phone.whatsapp_number}`);
            console.log('📱 Message ID:', response.data?.campaignId);
            
            await this.logMessage(
                `success_${Date.now()}_${phone.whatsapp_number}`,
                `${phone.country_code}${phone.whatsapp_number}`,
                'problem_solver_english',
                response.data
            );
            
            return { success: true, data: response.data };

        } catch (error) {
            console.log(`❌ FAILED to send to ${phone.country_code}${phone.whatsapp_number}`);
            console.log('Error:', error.response?.data?.error?.message);
            console.log('Details:', error.response?.data?.error?.error_data?.details);
            
            await this.logMessage(
                `failed_${Date.now()}_${phone.whatsapp_number}`,
                `${phone.country_code}${phone.whatsapp_number}`,
                'problem_solver_english',
                null,
                'failed'
            );
            
            return { 
                success: false, 
                error: error.response?.data?.error?.message,
                details: error.response?.data?.error?.error_data?.details
            };
        }
    }

    async sendToAllUsers() {
        try {
            console.log('🚀 STARTING DAY 1 MESSAGE SEND');
            console.log('=' .repeat(50));
            console.log('📋 Template: problem_solver_english');
            console.log('👥 Users: 2 test numbers');
            console.log('🎯 Strategy: No header (optional)');
            console.log('=' .repeat(50));

            let successCount = 0;
            let failedCount = 0;
            const results = [];

            // Try SIMPLE first (no components)
            console.log('\n1️⃣  ATTEMPT 1: Simple template (no components)');
            for (const phone of this.testNumbers) {
                const result = await this.sendTestMessage(phone, this.createSimplePayload, 'SIMPLE_NO_HEADER');
                results.push({
                    phone: `${phone.country_code}${phone.whatsapp_number}`,
                    success: result.success,
                    attempt: 'simple'
                });

                if (result.success) {
                    successCount++;
                } else {
                    failedCount++;
                    // If simple fails, try with body parameters
                    console.log('\n2️⃣  ATTEMPT 2: With body parameters');
                    const resultWithBody = await this.sendTestMessage(phone, this.createWithBodyPayload, 'WITH_BODY');
                    results.push({
                        phone: `${phone.country_code}${phone.whatsapp_number}`,
                        success: resultWithBody.success,
                        attempt: 'with_body'
                    });

                    if (resultWithBody.success) {
                        successCount++;
                        failedCount--; // Adjust counts
                    }
                }

                // Wait between sends
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            // Summary
            console.log('\n📊 SEND SUMMARY:');
            console.log('=' .repeat(50));
            console.log(`   ✅ Successful: ${successCount}`);
            console.log(`   ❌ Failed: ${failedCount}`);
            console.log(`   📊 Total: ${this.testNumbers.length}`);
            
            results.forEach(result => {
                console.log(`   ${result.success ? '✅' : '❌'} ${result.phone} (${result.attempt})`);
            });

            return {
                success: successCount > 0,
                sent: successCount,
                failed: failedCount,
                total: this.testNumbers.length,
                results
            };

        } catch (error) {
            console.error('💥 Send failed:', error);
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

// Run immediately
const scheduler = new SimpleTemplateScheduler();

scheduler.sendToAllUsers()
    .then(result => {
        if (result.success) {
            console.log('\n🎉 DAY 1 MESSAGES SENT SUCCESSFULLY!');
            console.log('✨ Ready to deploy for all 693 users tomorrow');
        } else {
            console.log('\n🔧 Debugging needed:');
            console.log('1. Check template exact name in Meta Business Suite');
            console.log('2. Verify template is approved and active');
            console.log('3. Check if template requires specific body parameters');
        }
        process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
        console.error('💥 Scheduler crashed:', error);
        process.exit(1);
    });
