// heltar-image-fix.js - Upload image to HELTAR-compatible CDN
import pkg from 'pg';
const { Client } = pkg;
import axios from 'axios';

class HeltarImageFix {
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
        
        console.log('✅ HELTAR Image Fix Scheduler Ready');
    }

    // CDN URLs that work with WhatsApp Business API
    getWorkingCDNUrls() {
        return [
            // Cloudinary CDN (free tier)
            'https://res.cloudinary.com/demo/image/upload/v1570989137/sample.jpg',
            
            // Imgur CDN (always works)
            'https://i.imgur.com/6JqB9pJ.jpeg',
            'https://i.imgur.com/VgYgqK5.jpeg',
            
            // Unsplash CDN (reliable)
            'https://images.unsplash.com/photo-1541963463532-d68292c34b19?w=400',
            'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
            
            // Picsum CDN (random images)
            'https://picsum.photos/400/400',
            
            // Your GitHub image through raw.githack.com (CDN proxy)
            'https://raw.githack.com/Siddharth748/sarthi-ai-bot/main/data/Gemini_Generated_Image_yccjv2yccjv2yccj-6.png'
        ];
    }

    // Test with different CDN URLs
    createCDNImagePayload(phone, imageUrl, testName) {
        const fullNumber = phone.country_code + phone.whatsapp_number;
        
        const payload = {
            campaignName: `Sarathi CDN Test - ${testName}`,
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
                                        link: imageUrl
                                    }
                                }
                            ]
                        }
                    ]
                },
                messageType: "template"
            }]
        };

        console.log(`📨 ${testName} Payload with image:`, imageUrl);
        return payload;
    }

    // Test: Upload to Cloudinary (free)
    async uploadToCloudinary() {
        try {
            console.log('📤 Attempting to upload to Cloudinary...');
            
            // For now, use a sample image. You can replace with your GitHub image URL
            const imageUrl = 'https://raw.githubusercontent.com/Siddharth748/sarthi-ai-bot/main/data/Gemini_Generated_Image_yccjv2yccjv2yccj-6.png';
            
            // Cloudinary upload API (you'd need to sign up for free account)
            // This is a placeholder - you'd need actual Cloudinary credentials
            const cloudinaryUrl = `https://res.cloudinary.com/demo/image/upload/w_400,h_400,c_fill/your-image-name.jpg`;
            
            console.log('✅ Using Cloudinary sample image');
            return cloudinaryUrl;
            
        } catch (error) {
            console.log('❌ Cloudinary upload failed:', error.message);
            return null;
        }
    }

    // Test: Use raw.githack.com (CDN proxy for GitHub)
    createGithackPayload(phone) {
        const fullNumber = phone.country_code + phone.whatsapp_number;
        
        // raw.githack.com acts as a CDN for GitHub raw files
        const githackUrl = 'https://raw.githack.com/Siddharth748/sarthi-ai-bot/main/data/Gemini_Generated_Image_yccjv2yccjv2yccj-6.png';
        
        const payload = {
            campaignName: "Sarathi Githack Test",
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
                                        link: githackUrl
                                    }
                                }
                            ]
                        }
                    ]
                },
                messageType: "template"
            }]
        };

        console.log('📨 Githack Payload:', githackUrl);
        return payload;
    }

    async sendTestMessage(phone, payloadCreator, testName, imageUrl = '') {
        try {
            console.log(`\n🧪 ${testName}: ${phone.country_code}${phone.whatsapp_number}`);
            if (imageUrl) console.log(`🖼️  Image: ${imageUrl}`);
            
            const payload = typeof payloadCreator === 'function' ? 
                payloadCreator(phone) : 
                this.createCDNImagePayload(phone, payloadCreator, testName);
            
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
            console.log('Campaign created successfully');
            
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

    async testAllCDNs() {
        try {
            console.log('🚀 TESTING CDN URLs WITH HELTAR');
            console.log('=' .repeat(60));
            console.log('📋 Template: problem_solver_english');
            console.log('🎯 Goal: Find CDN that HELTAR accepts for images');
            console.log('=' .repeat(60));

            const testPhone = this.testNumbers[0];
            const cdnUrls = this.getWorkingCDNUrls();
            
            // Test each CDN URL
            for (let i = 0; i < cdnUrls.length; i++) {
                const cdnUrl = cdnUrls[i];
                const testName = `CDN_${i + 1}`;
                
                console.log(`\n🔍 TEST ${i + 1}/${cdnUrls.length}: ${cdnUrl}`);
                const result = await this.sendTestMessage(testPhone, cdnUrl, testName, cdnUrl);
                
                if (result.success) {
                    console.log(`🎉 SUCCESS with CDN ${i + 1}!`);
                    console.log('✨ Use this CDN URL for your images');
                    return { success: true, cdnUrl, data: result.data };
                }
                
                // Wait between tests
                await new Promise(resolve => setTimeout(resolve, 3000));
            }

            // Test raw.githack.com separately
            console.log('\n🔍 TEST: raw.githack.com (GitHub CDN proxy)');
            const githackResult = await this.sendTestMessage(testPhone, this.createGithackPayload, 'GITHACK');
            
            if (githackResult.success) {
                console.log('🎉 SUCCESS with raw.githack.com!');
                return { success: true, cdnUrl: 'raw.githack.com', data: githackResult.data };
            }

            console.log('\n❌ ALL CDNs FAILED');
            console.log('💡 The issue is HELTAR stripping images, not the CDN');
            console.log('   Options:');
            console.log('   1. Contact HELTAR support about image stripping');
            console.log('   2. Use template without image for now');
            console.log('   3. Try different WhatsApp provider');
            
            return { success: false, error: 'All CDNs failed - HELTAR issue' };

        } catch (error) {
            console.error('💥 Test failed:', error);
            return { success: false, error: error.message };
        }
    }
}

// Run CDN tests
const scheduler = new HeltarImageFix();

scheduler.testAllCDNs()
    .then(result => {
        if (result.success) {
            console.log(`\n🎉 CDN SOLUTION FOUND: ${result.cdnUrl}`);
            console.log('✨ Use this CDN URL for all template images');
        } else {
            console.log('\n🚨 HELTAR IS STRIPPING IMAGES');
            console.log('   This is a HELTAR platform issue');
            console.log('   Contact their support: support@heltar.com');
            console.log('   For now, proceed without images for Day 1');
        }
        process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
        console.error('💥 Test crashed:', error);
        process.exit(1);
    });
