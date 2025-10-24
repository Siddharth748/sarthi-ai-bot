// simple-scheduler.js - Exact HELTAR Structure
import pkg from 'pg';
const { Client } = pkg;
import axios from 'axios';

class SimpleScheduler {
    constructor() {
        this.dbConfig = {
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        };

        this.heltarApiKey = process.env.HELTAR_API_KEY;
        this.heltarPhoneId = process.env.HELTAR_PHONE_ID;
        
        // Test numbers in HELTAR format
        this.testNumbers = [
            { country_code: "91", whatsapp_number: "8427792857" },
            { country_code: "91", whatsapp_number: "7018122128" }
        ];
        
        console.log('✅ Simple Scheduler Ready');
        console.log('📞 Test Numbers:', this.testNumbers.map(n => `${n.country_code}${n.whatsapp_number}`).join(', '));
    }

    async getDbClient() {
        const client = new Client(this.dbConfig);
        await client.connect();
        return client;
    }

    // EXACT HELTAR STRUCTURE WITH CAMPAIGN AND HEADER IMAGE
    createHeltarCampaignPayload(phone) {
        // Combine country code and number
        const fullNumber = phone.country_code + phone.whatsapp_number;
        
        const payload = {
            campaign: {
                name: "Sarathi AI Test Campaign", // Campaign name (required)
                description: "Testing problem_solver_english template" // Campaign description (optional)
            },
            contacts: [{
                country_code: phone.country_code,
                whatsapp_number: phone.whatsapp_number
            }],
            template: {
                name: "problem_solver_english",
                language_code: "en",
                header_image: "https://raw.githubusercontent.com/Siddharth748/sarthi-ai-bot/main/data/Gemini_Generated_Image_yccjv2yccjv2yccj-6.png",
                header_type: "image"
            }
        };

        console.log('📨 HELTAR Campaign Payload:', JSON.stringify(payload, null, 2));
        return payload;
    }

    async sendCampaignMessage(phone) {
        try {
            console.log(`\n🎯 SENDING TO: ${phone.country_code}${phone.whatsapp_number}`);
            
            const campaignPayload = this.createHeltarCampaignPayload(phone);
            
            // Use HELTAR campaign endpoint
            const response = await axios.post(
                `https://api.heltar.com/v1/campaigns/send`,
                campaignPayload,
                {
                    headers: {
                        'Authorization': `Bearer ${this.heltarApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            console.log('✅ CAMPAIGN SUCCESS! Response:', JSON.stringify(response.data, null, 2));
            
            // Log to database
            await this.logMessage(
                `campaign_${Date.now()}_${phone.whatsapp_number}`,
                `${phone.country_code}${phone.whatsapp_number}`,
                'problem_solver_english',
                response.data
            );
            
            return { success: true, data: response.data };

        } catch (error) {
            console.error('❌ CAMPAIGN FAILED:');
            console.error('Status:', error.response?.status);
            console.error('Error Data:', error.response?.data);
            console.error('Error Message:', error.message);
            
            // Log failure
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
                status: error.response?.status,
                data: error.response?.data
            };
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

    async runTest() {
        try {
            console.log('🚀 STARTING HELTAR CAMPAIGN TEST');
            console.log('=' .repeat(50));
            console.log('📋 Template: problem_solver_english');
            console.log('🖼️  Image: Gemini_Generated_Image_yccjv2yccjv2yccj-6.png');
            console.log('👥 Contacts: 2 test numbers');
            console.log('=' .repeat(50));

            let successCount = 0;
            let failedCount = 0;
            const results = [];

            // Send to both test numbers
            for (const phone of this.testNumbers) {
                console.log(`\n📍 Processing: ${phone.country_code}${phone.whatsapp_number}`);
                
                const result = await this.sendCampaignMessage(phone);
                results.push({
                    phone: `${phone.country_code}${phone.whatsapp_number}`,
                    success: result.success
                });

                if (result.success) {
                    successCount++;
                    console.log(`✅ SUCCESS: Sent to ${phone.country_code}${phone.whatsapp_number}`);
                } else {
                    failedCount++;
                    console.log(`❌ FAILED: ${phone.country_code}${phone.whatsapp_number}`);
                }

                // Wait 2 seconds between sends
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            // Summary
            console.log('\n📊 TEST SUMMARY:');
            console.log('=' .repeat(50));
            console.log(`   ✅ Successful: ${successCount}`);
            console.log(`   ❌ Failed: ${failedCount}`);
            console.log(`   📊 Total: ${this.testNumbers.length}`);
            
            results.forEach(result => {
                console.log(`   ${result.success ? '✅' : '❌'} ${result.phone}`);
            });

            return {
                success: successCount > 0,
                sent: successCount,
                failed: failedCount,
                total: this.testNumbers.length,
                results
            };

        } catch (error) {
            console.error('💥 Test failed:', error);
            return { success: false, error: error.message };
        }
    }
}

// Run immediately
const scheduler = new SimpleScheduler();

scheduler.runTest()
    .then(result => {
        console.log('\n✨ Test completed');
        process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
        console.error('💥 Test crashed:', error);
        process.exit(1);
    });
