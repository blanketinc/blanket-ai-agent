/**
 * OTP Authentication Endpoints
 *
 * POST /v2/ai-assistant/auth/request-otp — Send a 6-digit code to email
 * POST /v2/ai-assistant/auth/verify-otp  — Verify code and return Firebase custom token
 */

import express from 'express';
import * as admin from 'firebase-admin';
import sgMail from '@sendgrid/mail';

const router = express.Router();

const OTP_COLLECTION = 'ai_otp';
const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const OTP_COOLDOWN_MS = 15 * 1000; // 15 seconds between requests

// Initialize SendGrid
const sendGridKey = process.env.SENDGRID_API_KEY || '';
if (sendGridKey) {
  sgMail.setApiKey(sendGridKey);
}

function generateOTP(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * POST /auth/request-otp
 * Body: { email: string }
 */
router.post('/request-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'Valid email is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Verify user exists in Firebase Auth
    try {
      await admin.auth().getUserByEmail(normalizedEmail);
    } catch (e: any) {
      if (e.code === 'auth/user-not-found') {
        return res.status(404).json({ success: false, error: 'No account found with this email' });
      }
      throw e;
    }

    const db = admin.firestore();

    // Check for existing OTP (rate limiting)
    const existing = await db.collection(OTP_COLLECTION)
      .where('email', '==', normalizedEmail)
      .limit(1)
      .get();

    if (!existing.empty) {
      const doc = existing.docs[0];
      const data = doc.data();
      const now = Date.now();

      // Rate limit: 15s cooldown
      if (data.lastRequested && now - data.lastRequested < OTP_COOLDOWN_MS) {
        return res.status(429).json({
          success: false,
          error: 'Please wait before requesting another code',
        });
      }

      // Renew OTP
      const otp = generateOTP();
      await doc.ref.update({
        otp,
        lastRequested: now,
        modified: now,
      });

      await sendOTPEmail(normalizedEmail, otp);

      return res.json({ success: true, otpId: doc.id });
    }

    // Create new OTP
    const otp = generateOTP();
    const now = Date.now();
    const docRef = await db.collection(OTP_COLLECTION).add({
      email: normalizedEmail,
      otp,
      created: now,
      modified: now,
      lastRequested: now,
    });

    await sendOTPEmail(normalizedEmail, otp);

    return res.json({ success: true, otpId: docRef.id });
  } catch (error: any) {
    console.error('Request OTP error:', error);
    return res.status(500).json({ success: false, error: 'Failed to send code' });
  }
});

/**
 * POST /auth/verify-otp
 * Body: { email: string, otp: string, otpId: string }
 */
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp, otpId } = req.body;

    if (!email || !otp || !otpId) {
      return res.status(400).json({ success: false, error: 'email, otp, and otpId are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const db = admin.firestore();

    const doc = await db.collection(OTP_COLLECTION).doc(otpId).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'Code not found' });
    }

    const data = doc.data()!;

    // Verify email matches
    if (data.email !== normalizedEmail) {
      return res.status(403).json({ success: false, error: 'Email does not match' });
    }

    // Check expiry
    if (Date.now() - data.modified > OTP_EXPIRY_MS) {
      return res.status(410).json({ success: false, error: 'Code has expired. Please request a new one.' });
    }

    // Verify code
    if (data.otp !== otp.trim()) {
      return res.status(401).json({ success: false, error: 'Incorrect code' });
    }

    // Code is valid — generate Firebase custom token
    const userRecord = await admin.auth().getUserByEmail(normalizedEmail);
    const customToken = await admin.auth().createCustomToken(userRecord.uid);

    // Clean up used OTP
    await doc.ref.delete();

    return res.json({
      success: true,
      token: customToken,
    });
  } catch (error: any) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({ success: false, error: 'Failed to verify code' });
  }
});

/**
 * Send OTP code via SendGrid
 */
async function sendOTPEmail(email: string, otp: string): Promise<void> {
  if (!sendGridKey) {
    console.warn('SENDGRID_API_KEY not set — OTP not sent:', otp);
    return;
  }

  await sgMail.send({
    to: email,
    from: 'Blanket AI <no-reply@blanket.app>',
    subject: 'Your Blanket AI sign-in code',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 400px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #1a1a1a; margin-bottom: 8px;">Sign in to Blanket AI</h2>
        <p style="color: #6b7280; margin-bottom: 24px;">Enter this code to complete your sign-in:</p>
        <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #1a1a1a;">${otp}</span>
        </div>
        <p style="color: #9ca3af; font-size: 14px;">This code expires in 5 minutes. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}

export default router;
