// exact-image-header.js - Correct Image Header Structure
import pkg from 'pg';
const { Client } = pkg;
import axios from 'axios';

class ExactImageScheduler {
    constructor() {
        this.dbConfig = {
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        };

        this.heltarApiKey = process.env.HELTAR_API_KEY;
        this.heltarPhoneId = process.env.HELTAR_PHONE_ID;
        
        // Test numbers
        this.testNumbers = [
            { country_code: "91", whatsapp_number: "8427792857" }
        ];
        
        console.log('✅ Exact Image Header Scheduler Ready');
    }

    async getDbClient() {
        const client = new Client(this.dbConfig);
        await client.connect();
        return client;
    }

    // CORRECT: WhatsApp Business API exact image header structure
    createExactImagePayload(phone) {
        const fullNumber = phone.country_code + phone.whatsapp_number;
        
        const payload = {
            campaignName: "Sarathi AI Test",
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

        console.log('📨 Exact Image Payload:', JSON.stringify(payload, null, 2));
        return payload;
    }

    // TEST: Try with hosted image (GitHub raw might not be accessible)
    createHostedImagePayload(phone) {
        const fullNumber = phone.country_code + phone.whatsapp_number;
        
        const payload = {
            campaignName: "Sarathi AI Test",
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
                                        // Use a publicly accessible image from a CDN
                                        link: "https://i.imgur.com/6JqB9pJ.jpeg"
                                    }
                                }
                            ]
                        }
                    ]
                },
                messageType: "template"
            }]
        };

        console.log('📨 Hosted Image Payload:', JSON.stringify(payload, null, 2));
        return payload;
    }

    // TEST: Try different image structure (direct URL without nested image object)
    createDirectImagePayload(phone) {
        const fullNumber = phone.country_code + phone.whatsapp_number;
        
        const payload = {
            campaignName: "Sarathi AI Test",
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
                                        // Direct link without additional nesting
                                        link: "https://raw.githubusercontent.com/Siddharth748/sarthi-ai-bot/main/data/Gemini_Generated_Image_yccjv2yccjv2yccj-6.png"
                                    }
                                }
                            ]
                        },
                        {
                            type: "body",
                            parameters: [] // Empty body parameters
                        }
                    ]
                },
                messageType: "template"
            }]
        };

        console.log('📨 Direct Image + Body Payload:', JSON.stringify(payload, null, 2));
        return payload;
    }

    // TEST: Try with base64 encoded image (bypass URL issues)
    createBase64ImagePayload(phone) {
        const fullNumber = phone.country_code + phone.whatsapp_number;
        
        // Small base64 encoded test image (1x1 pixel red dot)
        const base64Image = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAADn/9k=";
        
        const payload = {
            campaignName: "Sarathi AI Test",
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
                                        link: base64Image
                                    }
                                }
                            ]
                        }
                    ]
                },
                messageType: "template"
            }]
        };

        console.log('📨 Base64 Image Payload:', JSON.stringify(payload, null, 2));
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
            console.log('Campaign ID:', response.data?.campaignId);
            
            return { success: true, data: response.data };

        } catch (error) {
            console.log(`❌ ${testName} FAILED:`);
            console.log('Error:', error.response?.data?.error?.message);
            console.log('Details:', error.response?.data?.error?.error_data?.details);
            console.log('Code:', error.response?.data?.error?.code);
            
            return { 
                success: false, 
                error: error.response?.data?.error?.message,
                details: error.response?.data?.error?.error_data?.details,
                code: error.response?.data?.error?.code
            };
        }
    }

    async runImageTests() {
        try {
            console.log('🚀 TESTING IMAGE HEADER SOLUTIONS');
            console.log('=' .repeat(60));
            console.log('📋 Template: problem_solver_english');
            console.log('🖼️  Issue: Header requires IMAGE but gets UNKNOWN');
            console.log('=' .repeat(60));

            const testPhone = this.testNumbers[0];
            const tests = [
                { name: 'EXACT_STRUCTURE', creator: this.createExactImagePayload },
                { name: 'HOSTED_IMAGE', creator: this.createHostedImagePayload },
                { name: 'DIRECT_IMAGE_BODY', creator: this.createDirectImagePayload },
                { name: 'BASE64_IMAGE', creator: this.createBase64ImagePayload }
            ];

            for (const test of tests) {
                console.log(`\n🔍 TEST: ${test.name}`);
                const result = await this.sendTestMessage(testPhone, test.creator, test.name);
                
                if (result.success) {
                    console.log(`🎉 SUCCESS with ${test.name}!`);
                    console.log('✨ Use this exact structure for all messages');
                    return { success: true, solution: test.name, data: result.data };
                }
                
                // Wait between tests
                await new Promise(resolve => setTimeout(resolve, 3000));
            }

            console.log('\n❌ ALL IMAGE SOLUTIONS FAILED');
            console.log('💡 The issue might be:');
            console.log('   1. Image URL not accessible by WhatsApp servers');
            console.log('   2. Template requires specific image format/size');
            console.log('   3. HELTAR API has different image structure');
            
            return { success: false, error: 'All image solutions failed' };

        } catch (error) {
            console.error('💥 Test failed:', error);
            return { success: false, error: error.message };
        }
    }
}

// Run tests
const scheduler = new ExactImageScheduler();

scheduler.runImageTests()
    .then(result => {
        if (result.success) {
            console.log(`\n🎉 IMAGE HEADER ISSUE SOLVED with: ${result.solution}`);
            console.log('✨ Template messages will now work!');
        } else {
            console.log('\n🔧 Next steps:');
            console.log('1. Upload image to a proper CDN (not GitHub raw)');
            console.log('2. Check image meets WhatsApp requirements:');
            console.log('   - Format: JPG, PNG, WEBP');
            console.log('   - Size: < 5MB');
            console.log('   - Dimensions: Recommended 1080x1080');
            console.log('3. Try different image URL');
        }
        process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
        console.error('💥 Test crashed:', error);
        process.exit(1);
    });
