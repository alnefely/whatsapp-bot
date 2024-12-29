const fs = require('fs-extra');
const mime = require('mime-types');
const axios = require('axios');
const { formatResponse } = require('../utils/helpers');

class MessageService {
    // إرسال رسالة نصية بسيطة
    static async sendText(sock, to, message) {
        const jid = this.formatJid(to);
        return await sock.sendMessage(jid, { text: message });
    }

    // إرسال صورة
    static async sendImage(sock, to, image, caption = '') {
        const jid = this.formatJid(to);
        let imageData;

        if (image.startsWith('http')) {
            const response = await axios.get(image, { responseType: 'arraybuffer' });
            imageData = Buffer.from(response.data, 'binary');
        } else {
            imageData = await fs.readFile(image);
        }

        return await sock.sendMessage(jid, {
            image: imageData,
            caption: caption
        });
    }

    // إرسال فيديو
    static async sendVideo(sock, to, video, caption = '') {
        const jid = this.formatJid(to);
        let videoData;

        if (video.startsWith('http')) {
            const response = await axios.get(video, { responseType: 'arraybuffer' });
            videoData = Buffer.from(response.data, 'binary');
        } else {
            videoData = await fs.readFile(video);
        }

        return await sock.sendMessage(jid, {
            video: videoData,
            caption: caption
        });
    }

    // إرسال ملف صوتي
    static async sendAudio(sock, to, audio, isVoiceNote = false) {
        const jid = this.formatJid(to);
        let audioData;

        if (audio.startsWith('http')) {
            const response = await axios.get(audio, { responseType: 'arraybuffer' });
            audioData = Buffer.from(response.data, 'binary');
        } else {
            audioData = await fs.readFile(audio);
        }

        const messageData = {
            audio: audioData,
            ptt: isVoiceNote,
            mimetype: mime.lookup(audio) || 'audio/mp4'
        };

        return await sock.sendMessage(jid, messageData);
    }

    // إرسال ملف PDF
    static async sendPdf(sock, to, pdfPath, fileName = '', caption = '') {
        const jid = this.formatJid(to);
        let pdfData;

        try {
            if (pdfPath.startsWith('http')) {
                const response = await axios.get(pdfPath, { responseType: 'arraybuffer' });
                pdfData = Buffer.from(response.data, 'binary');
            } else {
                pdfData = await fs.readFile(pdfPath);
            }

            return await sock.sendMessage(jid, {
                document: pdfData,
                fileName: fileName || 'document.pdf',
                caption: caption,
                mimetype: 'application/pdf'
            });
        } catch (error) {
            throw new Error(`Failed to send PDF: ${error.message}`);
        }
    }

    // إرسال موقع
    static async sendLocation(sock, to, latitude, longitude) {
        const jid = this.formatJid(to);
        return await sock.sendMessage(jid, {
            location: {
                degreesLatitude: latitude,
                degreesLongitude: longitude
            }
        });
    }

    // إرسال جهة اتصال
    static async sendContact(sock, to, contactData) {
        const jid = this.formatJid(to);
        return await sock.sendMessage(jid, {
            contacts: {
                displayName: contactData.name,
                contacts: [{ vcard: this.createVCard(contactData) }]
            }
        });
    }

    // إرسال رسائل جماعية
    static async sendBulk(sock, numbers, message, type = 'text', mediaData = null) {
        const results = [];
        
        for (const to of numbers) {
            try {
                let result;
                const jid = this.formatJid(to);

                switch (type) {
                    case 'text':
                        result = await this.sendText(sock, jid, message);
                        break;
                    case 'image':
                        result = await this.sendImage(sock, jid, mediaData, message);
                        break;
                    case 'pdf':
                        result = await this.sendPdf(sock, jid, mediaData, message);
                        break;
                    case 'video':
                        result = await this.sendVideo(sock, jid, mediaData, message);
                        break;
                    default:
                        throw new Error('Unsupported message type for bulk sending');
                }

                results.push({
                    number: to,
                    success: true,
                    result
                });

                // تأخير بين الرسائل لتجنب الحظر
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
                results.push({
                    number: to,
                    success: false,
                    error: error.message
                });
            }
        }

        return results;
    }

    // تحويل رقم الهاتف إلى JID
    static formatJid(to) {
        return to.includes('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`;
    }

    // إنشاء vCard لجهة الاتصال
    static createVCard(contact) {
        return `BEGIN:VCARD\nVERSION:3.0\nFN:${contact.name}\nTEL;type=CELL;type=VOICE;waid=${contact.phone}:${contact.phone}\nEND:VCARD`;
    }
}

module.exports = MessageService;