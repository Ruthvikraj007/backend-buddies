import nodemailer from 'nodemailer';
import crypto from 'crypto';

class EmailService {
  constructor() {
    // Create transporter with SMTP configuration
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT || 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }

  /**
   * Generate a random verification token
   */
  generateVerificationToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Send verification email
   */
  async sendVerificationEmail(email, username, verificationToken) {
    try {
      const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email?token=${verificationToken}`;
      
      const mailOptions = {
        from: `"SignLink" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Verify Your SignLink Account',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
              }
              .container {
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f9f9f9;
              }
              .header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 30px;
                text-align: center;
                border-radius: 10px 10px 0 0;
              }
              .content {
                background: white;
                padding: 30px;
                border-radius: 0 0 10px 10px;
              }
              .button {
                display: inline-block;
                padding: 15px 30px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                text-decoration: none;
                border-radius: 5px;
                margin: 20px 0;
                font-weight: bold;
              }
              .footer {
                text-align: center;
                margin-top: 20px;
                color: #666;
                font-size: 12px;
              }
              .token {
                background: #f0f0f0;
                padding: 10px;
                border-radius: 5px;
                font-family: monospace;
                word-break: break-all;
                margin: 10px 0;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>👋 Welcome to SignLink!</h1>
              </div>
              <div class="content">
                <h2>Hello ${username}! 🎉</h2>
                <p>Thank you for signing up for SignLink - connecting deaf and hearing communities through technology.</p>
                <p>To complete your registration, please verify your email address by clicking the button below:</p>
                
                <center>
                  <a href="${verificationUrl}" class="button">Verify Email Address</a>
                </center>
                
                <p>Or copy and paste this link in your browser:</p>
                <div class="token">${verificationUrl}</div>
                
                <p><strong>This verification link will expire in 24 hours.</strong></p>
                
                <p>If you didn't create an account with SignLink, please ignore this email.</p>
                
                <p>Best regards,<br>The SignLink Team</p>
              </div>
              <div class="footer">
                <p>© ${new Date().getFullYear()} SignLink. All rights reserved.</p>
                <p>This is an automated email. Please do not reply to this message.</p>
              </div>
            </div>
          </body>
          </html>
        `
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ Verification email sent:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Error sending verification email:', error);
      throw new Error(`Failed to send verification email: ${error.message}`);
    }
  }

  /**
   * Send welcome email after successful verification
   */
  async sendWelcomeEmail(email, username) {
    try {
      const mailOptions = {
        from: `"SignLink" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Welcome to SignLink! 🎉',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
              }
              .container {
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f9f9f9;
              }
              .header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 30px;
                text-align: center;
                border-radius: 10px 10px 0 0;
              }
              .content {
                background: white;
                padding: 30px;
                border-radius: 0 0 10px 10px;
              }
              .feature {
                margin: 15px 0;
                padding: 10px;
                background: #f8f9fa;
                border-left: 4px solid #667eea;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>✅ Email Verified!</h1>
              </div>
              <div class="content">
                <h2>Welcome aboard, ${username}! 🚀</h2>
                <p>Your email has been successfully verified. You can now enjoy all the features of SignLink:</p>
                
                <div class="feature">
                  <strong>📹 Video Calls</strong> - Connect with friends through high-quality video calls
                </div>
                <div class="feature">
                  <strong>🤟 Sign Language Detection</strong> - AI-powered ASL letter recognition
                </div>
                <div class="feature">
                  <strong>💬 Real-time Captions</strong> - Automatic text-to-speech for accessibility
                </div>
                <div class="feature">
                  <strong>👥 Connect & Chat</strong> - Build your network and communicate seamlessly
                </div>
                
                <p>Start exploring SignLink now and connect with the community!</p>
                
                <p>If you have any questions or need help, feel free to reach out to our support team.</p>
                
                <p>Best regards,<br>The SignLink Team</p>
              </div>
            </div>
          </body>
          </html>
        `
      };

      await this.transporter.sendMail(mailOptions);
      console.log('✅ Welcome email sent to:', email);
    } catch (error) {
      console.error('❌ Error sending welcome email:', error);
      // Don't throw error - welcome email is not critical
    }
  }

  /**
   * Verify SMTP configuration
   */
  async verifyConnection() {
    try {
      await this.transporter.verify();
      console.log('✅ SMTP server is ready to send emails');
      return true;
    } catch (error) {
      console.error('❌ SMTP server connection failed:', error);
      return false;
    }
  }
}

export default new EmailService();
