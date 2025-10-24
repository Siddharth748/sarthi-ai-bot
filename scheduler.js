// scheduler.js - FIXED TEMPLATE STRUCTURE
import pkg from 'pg';
const { Client } = pkg;
import axios from 'axios';

class SarathiTestScheduler {
    constructor() {
        this.dbConfig = {
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        };

        this.heltarApiKey = process.env.HELTAR_API_KEY;
        this.heltarPhoneId = process.env.HELTAR_PHONE_ID;
        this.testNumber = '918427792857';
        
        console.log('✅ Test Scheduler Ready');
        console.log(`🎯 Testing with: ${this.testNumber}`);
    }

    // CORRECT HELTAR TEMPLATE STRUCTURES
    createTemplatePayload(templateName) {
        const cleanPhone = this.testNumber.replace(/\D/g, '');
        
        // DIFFERENT STRUCTURES FOR DIFFERENT TEMPLATES
        const templateStructures = {
            'problem_solver_english': {
                name: "problem_solver_english",
                language: { code: "en", policy: "deterministic" },
                components: [
                    {
                        type: "body",
                        parameters: [
                            { type: "text", text: "User" }
                        ]
                    }
                ]
            },
            'daily_wisdom_english': {
                name: "daily_wisdom_english", 
                language: { code: "en", policy: "deterministic" },
                components: [
                    {
                        type: "body", 
                        parameters: [
                            { type: "text", text: "Focus on your duty, not the results" },
                            { type: "text", text: "Reduce anxiety by concentrating on actions within your control" }
                        ]
                    }
                ]
            },
            'emotional_check_in_english': {
                name: "emotional_check_in_english",
                language: { code: "en", policy: "deterministic" },
                components: [
                    {
                        type: "body",
                        parameters: [
                            { type: "text", text: "Emotional Awareness: Take 30 seconds to check in with yourself." },
                            { type: "text", text: "Notice your current mood without judgment." }
                        ]
                    }
                ]
            }
        };

        const template = templateStructures[templateName] || templateStructures['problem_solver_english'];
        
        return {
            messages: [{
                clientWaNumber: cleanPhone,
                message: template,
                messageType: "template"
            }]
        };
    }

    async sendTestMessage() {
        try {
            console.log(`\n🎯 SENDING TO: ${this.testNumber}`);
            
            // TEST 1: Try SIMPLE structure first
            console.log('\n🧪 TEST 1: Simple Template Structure');
            const simplePayload = {
                messages: [{
                    clientWaNumber: this.testNumber.replace(/\D/g, ''),
                    message: {
                        name: "problem_solver_english",
                        language: { code: "en" }
                    },
                    messageType: "template"
                }]
            };
            
            console.log('📨 Simple Payload:', JSON.stringify(simplePayload, null, 2));
            
            const simpleResponse = await axios.post(
                `https://api.heltar.com/v1/messages/send`,
                simplePayload,
                {
                    headers: {
                        'Authorization': `Bearer ${this.heltarApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            console.log('✅ SIMPLE SUCCESS! Response:', JSON.stringify(simpleResponse.data, null, 2));
            return { success: true, type: 'simple', data: simpleResponse.data };

        } catch (error) {
            console.log('❌ SIMPLE FAILED:', error.response?.data || error.message);
            
            // TEST 2: Try with components
            try {
                console.log('\n🧪 TEST 2: With Components Structure');
                const componentsPayload = {
                    messages: [{
                        clientWaNumber: this.testNumber.replace(/\D/g, ''),
                        message: {
                            name: "problem_solver_english",
                            language: { code: "en", policy: "deterministic" },
                            components: [
                                {
                                    type: "body",
                                    parameters: [
                                        { type: "text", text: "User" }
                                    ]
                                }
                            ]
                        },
                        messageType: "template"
                    }]
                };
                
                console.log('📨 Components Payload:', JSON.stringify(componentsPayload, null, 2));
                
                const componentsResponse = await axios.post(
                    `https://api.heltar.com/v1/messages/send`,
                    componentsPayload,
                    {
                        headers: {
                            'Authorization': `Bearer ${this.heltarApiKey}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 30000
                    }
                );

                console.log('✅ COMPONENTS SUCCESS! Response:', JSON.stringify(componentsResponse.data, null, 2));
                return { success: true, type: 'components', data: componentsResponse.data };

            } catch (error2) {
                console.log('❌ COMPONENTS FAILED:', error2.response?.data || error2.message);
                
                // TEST 3: Try ULTRA SIMPLE
                try {
                    console.log('\n🧪 TEST 3: Ultra Simple Structure');
                    const ultraSimplePayload = {
                        messaging_product: "whatsapp",
                        to: this.testNumber.replace(/\D/g, ''),
                        type: "template",
                        template: {
                            name: "problem_solver_english",
                            language: { code: "en" }
                        }
                    };
                    
                    console.log('📨 Ultra Simple (Direct WhatsApp):', JSON.stringify(ultraSimplePayload, null, 2));
                    
                    const ultraResponse = await axios.post(
                        `https://graph.facebook.com/v18.0/${this.heltarPhoneId}/messages`,
                        ultraSimplePayload,
                        {
                            headers: {
                                'Authorization': `Bearer ${this.heltarApiKey}`,
                                'Content-Type': 'application/json'
                            },
                            timeout: 30000
                        }
                    );

                    console.log('✅ ULTRA SIMPLE SUCCESS! Response:', JSON.stringify(ultraResponse.data, null, 2));
                    return { success: true, type: 'ultra_simple', data: ultraResponse.data };

                } catch (error3) {
                    console.log('❌ ULTRA SIMPLE FAILED:', error3.response?.data || error3.message);
                    return { success: false, error: 'All tests failed' };
                }
            }
        }
    }

    async runTest() {
        try {
            console.log('🚀 STARTING TEMPLATE STRUCTURE TESTS...');
            console.log('='.repeat(60));
            
            const result = await this.sendTestMessage();
            
            console.log('\n📋 FINAL TEST RESULT:');
            console.log('='.repeat(60));
            if (result.success) {
                console.log(`🎉 SUCCESS with ${result.type} structure!`);
                console.log('📊 Message ID:', result.data?.messages?.[0]?.id);
            } else {
                console.log('❌ ALL TEMPLATE STRUCTURES FAILED');
                console.log('💡 Check: Template name, approval status, or API credentials');
            }
            
            return result;

        } catch (error) {
            console.error('💥 Test crashed:', error);
            return { success: false, error: error.message };
        }
    }
}

// Run immediately
const testScheduler = new SarathiTestScheduler();

testScheduler.runTest()
    .then(result => {
        console.log('\n✨ Test session completed');
        process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
        console.error('💥 Test session crashed:', error);
        process.exit(1);
    });
