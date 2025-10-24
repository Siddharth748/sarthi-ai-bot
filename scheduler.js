// cdn-image-scheduler.js - Upload image to CDN first
import pkg from 'pg';
const { Client } = pkg;
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

class CDNImageScheduler {
    constructor() {
        this.dbConfig = {
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        };

        this.heltarApiKey = process.env.HELTAR_API_KEY;
        
        // Test numbers
        this.testNumbers = [
            { country_code: "91", whatsapp_number: "8427792857" }
        ];
        
        console.log('✅ CDN Image Scheduler Ready');
    }

    async getDbClient() {
        const client = new Client(this.dbConfig);
        await client.connect();
        return client;
    }

    // METHOD 1: Use ImgBB free API to upload image
    async uploadImageToImgBB(imageUrl) {
        try {
            console.log('📤 Uploading image to ImgBB...');
            
            // Download image first
            const response = await axios.get(imageUrl, { 
                responseType: 'arraybuffer',
                timeout: 30000
            });
            
            const formData = new FormData();
            formData.append('image', response.data.toString('base64'));
            
            // Upload to ImgBB (free, no API key needed)
            const uploadResponse = await axios.post(
                'https://api.imgbb.com/1/upload?key=your-imgbb-key-here', // You can get free key from imgbb.com
                formData,
                {
                    headers: formData.getHeaders(),
                    timeout: 30000
                }
            );
            
            const cdnUrl = uploadResponse.data.data.url;
            console.log('✅ Image uploaded to CDN:', cdnUrl);
            return cdnUrl;
            
        } catch (error) {
            console.log('❌ Image upload failed:', error.message);
            return null;
        }
    }

    // METHOD 2: Use a reliable public CDN image
    getReliableImageURL() {
        // Using Unsplash - always accessible, proper SSL
        const reliableImages = [
            'https://images.unsplash.com/photo-1541963463532-d68292c34b19?ixlib=rb-4.0.3&w=400', // Book image
            'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&w=400', // Person
            'https://images.unsplash.com/photo-1471107340929-a87cd0f5b5f3?ixlib=rb-4.0.3&w=400'  // Writing
        ];
        return reliableImages[Math.floor(Math.random() * reliableImages.length)];
    }

    // METHOD 3: Try without image (force template to work)
    createNoImagePayload(phone) {
        const fullNumber = phone.country_code + phone.whatsapp_number;
        
        const payload = {
            campaignName: "Sarathi AI No Image Test",
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
                    // NO COMPONENTS - try without header
                },
                messageType: "template"
            }]
        };

        console.log('📨 No Image Payload:', JSON.stringify(payload, null, 2));
        return payload;
    }

    // METHOD 4: Try different template that doesn't require image
    createDifferentTemplatePayload(phone) {
        const fullNumber = phone.country_code + phone.whatsapp_number;
        
        // Try other approved templates that might not have image headers
        const alternativeTemplates = [
            'daily_wisdom_english',
            'emotional_check_in_english'
        ];
        
        const templateName = alternativeTemplates[0]; // Try first alternative
        
        const payload = {
            campaignName: "Sarathi AI Alternative Template",
            templateName: templateName, 
            languageCode: "en",
            messages: [{
                clientWaNumber: fullNumber,
                message: {
                    name: templateName,
                    language: {
                        code: "en",
                        policy: "deterministic"
                    }
                },
                messageType: "template"
            }]
        };

        console.log('📨 Alternative Template Payload:', JSON.stringify(payload, null, 2));
        return payload;
    }

    // METHOD 5: Use reliable CDN image with correct structure
    createReliableImagePayload(phone) {
        const fullNumber = phone.country_code + phone.whatsapp_number;
        const reliableImageUrl = this.getReliableImageURL();
        
        const payload = {
            campaignName: "Sarathi AI Reliable Image",
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
                                        link: reliableImageUrl
                                    }
                                }
                            ]
                        }
                    ]
                },
                messageType: "template"
            }]
        };

        console.log('📨 Reliable Image Payload:', JSON.stringify(payload, null, 2));
        console.log('🖼️  Using image:', reliableImageUrl);
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
            console.log('Status:', response.data?.status);
            
            return { success: true, data: response.data };

        } catch (error) {
            console.log(`❌ ${testName} FAILED:`);
            console.log('Error:', error.response?.data?.error?.message);
            console.log('Details:', error.response?.data?.error?.error_data?.details);
            
            return { 
                success: false, 
                error: error.response?.data?.error?.message,
                details: error.response?.data?.error?.error_data?.details
            };
        }
    }

    async runAllSolutions() {
        try {
            console.log('🚀 TESTING IMAGE URL SOLUTIONS');
            console.log('=' .repeat(60));
            console.log('📋 Template: problem_solver_english');
            console.log('💡 Issue: WhatsApp rejects GitHub image URLs');
            console.log('=' .repeat(60));

            const testPhone = this.testNumbers[0];
            const tests = [
                { name: 'NO_IMAGE', creator: this.createNoImagePayload },
                { name: 'RELIABLE_CDN_IMAGE', creator: this.createReliableImagePayload },
                { name: 'ALTERNATIVE_TEMPLATE', creator: this.createDifferentTemplatePayload }
            ];

            for (const test of tests) {
                console.log(`\n🔍 TEST: ${test.name}`);
                const result = await this.sendTestMessage(testPhone, test.creator, test.name);
                
                if (result.success) {
                    console.log(`🎉 SUCCESS with ${test.name}!`);
                    console.log('✨ Use this solution for Day 1 messages');
                    return { success: true, solution: test.name, data: result.data };
                }
                
                // Wait between tests
                await new Promise(resolve => setTimeout(resolve, 5000));
            }

            console.log('\n❌ ALL SOLUTIONS FAILED');
            console.log('💡 Final options:');
            console.log('   1. Create new template without image header');
            console.log('   2. Upload your image to Cloudinary/CDN');
            console.log('   3. Use different template for Day 1');
            
            return { success: false, error: 'All solutions failed' };

        } catch (error) {
            console.error('💥 Test failed:', error);
            return { success: false, error: error.message };
        }
    }
}

// Run solutions
const scheduler = new CDNImageScheduler();

scheduler.runAllSolutions()
    .then(result => {
        if (result.success) {
            console.log(`\n🎉 SOLUTION FOUND: ${result.solution}`);
            console.log('✨ Ready to send Day 1 messages!');
        } else {
            console.log('\n🚨 URGENT: Need to fix template configuration');
            console.log('   The current template requires an image but rejects all image URLs');
            console.log('   Options:');
            console.log('   - Create new template without image header');
            console.log('   - Use different template for Day 1');
            console.log('   - Contact HELTAR support about image URL issues');
        }
        process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
        console.error('💥 Test crashed:', error);
        process.exit(1);
    });
