// src/api/routes/email.routes.ts
import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { google } from 'googleapis';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../config/index';
import { User } from '../models/user.model';
import EmailModel, { IEmail } from '../models/email.model';

const router = Router();
const genAI = new GoogleGenerativeAI(config.geminiApiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

interface JwtPayload { id: string; }

const getEmailBody = (payload: any): string => {
    if (!payload) return ''; let body = ''; const partsToSearch = [payload];
    while (partsToSearch.length) {
        const part = partsToSearch.shift();
        if (part.mimeType === 'text/html' && part.body?.data) return Buffer.from(part.body.data, 'base64').toString('utf8');
        if (part.mimeType === 'text/plain' && part.body?.data && !body) body = Buffer.from(part.body.data, 'base64').toString('utf8');
        if (part.parts) partsToSearch.push(...part.parts);
    }
    return body || (payload.body?.data ? Buffer.from(payload.body.data, 'base64').toString('utf8') : '');
};

const getAuthenticatedClient = async (req: Request) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) throw new Error('Authentication failed');
    const token = authHeader.split(' ')[1];
    if (!token) throw new Error('Authentication failed');
    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
    const user = await User.findById(decoded.id);
    if (!user) throw new Error('User not found');
    
    const oauth2Client = new google.auth.OAuth2(config.google.clientId, config.google.clientSecret);
    oauth2Client.setCredentials({ 
      access_token: user.accessToken, 
      refresh_token: user.refreshToken 
    });

    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        user.accessToken = tokens.access_token;
        if (tokens.refresh_token) {
          user.refreshToken = tokens.refresh_token;
        }
        await user.save();
      }
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client }); 
    return { user, gmail, calendar, oauth2Client };
};

// ROUTE 1: Get email list (Now with more robust logic)
router.get('/', async (req: Request, res: Response) => {
    try {
        const { user, gmail } = await getAuthenticatedClient(req);
        const listResponse = await gmail.users.messages.list({ userId: 'me', maxResults: 25, q: 'in:inbox category:primary newer_than:7d' });
        const messages = listResponse.data.messages ?? [];
        if (messages.length === 0) return res.status(200).json([]);
        const messageIds = messages.map(m => m.id!);

        const cachedEmails = await EmailModel.find({ userId: user._id, gmailMessageId: { $in: messageIds } });
        const cachedIds = new Set(cachedEmails.map(e => e.gmailMessageId));
        const uncachedIds = messageIds.filter(id => !cachedIds.has(id));
        
        if (uncachedIds.length > 0) {
            const fullEmailResponses = await Promise.all(uncachedIds.map(id => 
                gmail.users.messages.get({ userId: 'me', id: id, format: 'full' })
            ));

            const newEmailsToSave = fullEmailResponses.map(response => {
                const headers = response.data.payload?.headers;
                return {
                    userId: user._id,
                    gmailMessageId: response.data.id!,
                    from: headers?.find(h => h.name === 'From')?.value ?? '?',
                    subject: headers?.find(h => h.name === 'Subject')?.value ?? '?',
                    snippet: response.data.snippet ?? '',
                    body: getEmailBody(response.data.payload),
                    receivedAt: new Date(parseInt(response.data.internalDate!, 10)),
                    threadId: response.data.threadId!,
                    messageIdHeader: headers?.find(h => h.name === 'Message-ID')?.value ?? `<${response.data.id}@mail.gmail.com>`,
                    referencesHeader: headers?.find(h => h.name === 'References')?.value,
                    aiPriority: 'neutral', // Default value
                    aiSummary: 'Pending analysis...', // Default value
                    aiSuggestion: '', // Default value
                };
            });

            if (newEmailsToSave.length > 0) {
                await EmailModel.insertMany(newEmailsToSave, { ordered: false }).catch(() => {});
            }

            // Now, attempt AI analysis
            const emailsForAI = newEmailsToSave.map(e => ({
                id: e.gmailMessageId,
                body: e.body.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim().substring(0, 4000)
            })).filter(e => e.body);

            if (emailsForAI.length > 0) {
                try {
                    const currentDateForAI = new Date().toLocaleDateString('en-CA');
                    const batchPrompt = `Analyze the following emails and return a single valid JSON array. Schema for each object: "id" (string), "priority" (string: "urgent", "neutral", "spam"), "summary" (string), "suggestion" (string), "isMeetingRequest" (boolean), "proposedDate" (string: "YYYY-MM-DD" or null), "proposedTime" (string: "HH:MM" or null). Base date is ${currentDateForAI}. Emails: ${JSON.stringify(emailsForAI)}`;
                    const result = await model.generateContent(batchPrompt);
                    const aiResponseText = result.response.text();
                    const analyses: any[] = JSON.parse(aiResponseText.replace(/```json|```/g, '').trim());

                    const bulkDbOperations = analyses.map(analysis => ({
                        updateOne: {
                            filter: { userId: user._id, gmailMessageId: analysis.id },
                            update: {
                                $set: {
                                    aiPriority: analysis.priority,
                                    aiSummary: analysis.summary,
                                    aiSuggestion: analysis.suggestion,
                                    isMeetingRequest: analysis.isMeetingRequest || false,
                                    aiProposedDate: analysis.proposedDate,
                                    aiProposedTime: analysis.proposedTime,
                                }
                            }
                        }
                    }));
                    
                    if (bulkDbOperations.length > 0) {
                        await EmailModel.bulkWrite(bulkDbOperations);
                    }
                } catch (aiError) {
                    console.error("[Batch AI] Non-critical failure, emails saved without analysis:", aiError);
                }
            }
        }
        
        const allEmails = await EmailModel.find({ userId: user._id, gmailMessageId: { $in: messageIds } }).sort({ receivedAt: -1 });
        res.status(200).json(allEmails);

    } catch (error: any) { 
        console.error("Error in GET /emails:", error);
        res.status(500).json({ message: 'Error fetching email list' }); 
    }
});

// ... (rest of the file remains the same, no changes needed for other routes)

// ROUTE 2: Analyze a single email on demand (changed to use URL param)
router.post('/analyze/:messageId', async (req: Request, res: Response) => {
    try {
        const { messageId } = req.params;
        const { user, gmail } = await getAuthenticatedClient(req);

        const emailResponse = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
        const headers = emailResponse.data.payload?.headers;
        const body = getEmailBody(emailResponse.data.payload);
        
        let aiAnalysis: any;
        try {
            const plainTextBodyForAI = body.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim().substring(0, 8000);
            
            console.log(`[AI Analysis] Preparing to analyze messageId: ${messageId}. Body length: ${plainTextBodyForAI.length}`);

            if (plainTextBodyForAI) {
                const prompt = `Critically analyze this email. Respond with a single, valid JSON object, and nothing else. JSON Keys: "priority" (string: "urgent", "neutral", or "spam"), "summary" (string: a one-sentence summary), "suggestion" (string: a professional reply suggestion), and "isMeetingRequest" (boolean). Email: "${plainTextBodyForAI}"`;
                const result = await model.generateContent(prompt);
                const aiResponseText = result.response.text();
                
                console.log(`[AI Analysis] Raw AI Response for ${messageId}:`, aiResponseText);
                
                aiAnalysis = JSON.parse(aiResponseText.replace(/```json|```/g, '').trim());
            } else {
                aiAnalysis = { priority: 'neutral', summary: 'No text content to analyze.', suggestion: '', isMeetingRequest: false };
            }
        } catch (aiError: any) {
            console.error(`[AI Analysis] CRITICAL FAILURE for messageId ${messageId}. Details:`, aiError);
            
            if (aiError.response) {
                console.error('[AI Analysis] Error Response Data:', aiError.response.data);
            }

            aiAnalysis = { priority: 'error', summary: 'AI service failed to analyze this email.', suggestion: '', isMeetingRequest: false };
        }

        const fullEmailData = {
            userId: user._id, gmailMessageId: messageId,
            from: headers?.find(h => h.name === 'From')?.value ?? '?', subject: headers?.find(h => h.name === 'Subject')?.value ?? '?',
            snippet: emailResponse.data.snippet ?? '', body: body, receivedAt: new Date(parseInt(emailResponse.data.internalDate!, 10)),
            threadId: emailResponse.data.threadId!,
            messageIdHeader: headers?.find(h => h.name === 'Message-ID')?.value ?? `<${messageId}@mail.gmail.com>`,
            referencesHeader: headers?.find(h => h.name === 'References')?.value,
            aiPriority: aiAnalysis.priority, aiSummary: aiAnalysis.summary,
            aiSuggestion: aiAnalysis.suggestion, isMeetingRequest: aiAnalysis.isMeetingRequest || false,
        };

        const updatedEmail = await EmailModel.findOneAndUpdate(
            { userId: user._id, gmailMessageId: messageId },
            fullEmailData, { upsert: true, new: true }
        );
        res.status(200).json(updatedEmail);
    } catch (error: any) { 
        console.error(`[AI Analysis] General error in /analyze route for messageId ${req.params.messageId}:`, error);
        if (error.message.includes('Authentication')) return res.status(401).json({ message: 'Authentication error.' });
        res.status(500).json({ message: 'Error analyzing email' }); 
    }
});

// ROUTE 3: Send an email (Your existing code is good)
router.post('/send', async (req: Request, res: Response) => {
   try {
       const { user, gmail } = await getAuthenticatedClient(req);
       const { to, subject, body, threadId, inReplyTo, references } = req.body;

       if (!to || !subject || !body || !threadId) return res.status(400).json({ message: 'Missing required fields for reply' });
       
       const emailParts = [
           `From: "${user.displayName}" <${user.email}>`, `To: ${to}`, `Subject: ${subject}`,
           `In-Reply-To: ${inReplyTo}`, `References: ${references}`,
           'Content-Type: text/plain; charset=utf-8', '', body,
       ];
       const emailStr = emailParts.join('\r\n');
       const encodedMessage = Buffer.from(emailStr).toString('base64url');

       await gmail.users.messages.send({
           userId: 'me', requestBody: { raw: encodedMessage, threadId: threadId },
       });
       res.status(200).json({ message: 'Reply sent successfully!' });
   } catch (error: any) {
       console.error('Error sending email:', error.response?.data?.error || error.message);
       res.status(500).json({ message: 'Failed to send reply' });
   }
});


// --- ADDED ---: Calendar routes for smart scheduling

// ROUTE 4: Check calendar availability (More Robust)
router.post('/calendar/check-availability', async (req: Request, res: Response) => {
    try {
        const { calendar } = await getAuthenticatedClient(req);
        const { start, end } = req.body;

        if (!start || !end) {
            return res.status(400).json({ message: 'Start and end times are required.' });
        }

        const response = await calendar.freebusy.query({
            requestBody: {
                timeMin: start,
                timeMax: end,
                items: [{ id: 'primary' }],
            },
        });
        
        const busySlots = response.data.calendars?.primary?.busy ?? [];
        const isAvailable = busySlots.length === 0;

        res.status(200).json({ isAvailable });

    } catch (error: any) {
        console.error('Error checking calendar availability:', error.response?.data?.error || error.message);
        res.status(500).json({ message: 'Failed to check calendar availability.' });
    }
});

// ROUTE 5: Create a calendar event
router.post('/calendar/create-event', async (req: Request, res: Response) => {
    try {
        const { calendar } = await getAuthenticatedClient(req);
        const { summary, description, start, end, attendees } = req.body;

        if (!summary || !start || !end || !attendees) {
            return res.status(400).json({ message: 'Missing required event details.' });
        }

        const event = {
            summary, description,
            start: { dateTime: start, timeZone: 'Asia/Kolkata' }, // Using your local timezone
            end: { dateTime: end, timeZone: 'Asia/Kolkata' },
            attendees: attendees.map((email: string) => ({ email })),
            reminders: {
                useDefault: true,
            },
        };

        const createdEvent = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: event,
            sendNotifications: true,
        });

        res.status(201).json({ message: 'Event created successfully!', event: createdEvent.data });
    } catch (error: any) {
        console.error('Error creating calendar event:', error);
        res.status(500).json({ message: 'Failed to create calendar event.' });
    }
});


export default router;
