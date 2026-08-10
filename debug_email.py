#!/usr/bin/env python3
"""
Debug script to test email sending with detailed error reporting
"""
import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def debug_email_send():
    """Debug email sending with detailed logging"""
    print("🔧 DEBUGGING EMAIL SYSTEM")
    print("=" * 50)
    
    # Check environment variables
    sender_email = os.getenv("SMTP_EMAIL")
    sender_password = os.getenv("SMTP_PASSWORD")
    
    print(f"📧 SMTP_EMAIL: {sender_email}")
    print(f"🔐 SMTP_PASSWORD: {'*' * len(sender_password) if sender_password else 'NOT SET'}")
    
    if not sender_email or not sender_password:
        print("❌ ERROR: Missing SMTP credentials in .env file")
        return False
    
    # Test email to send OTP
    test_email = "jayveervora47@gmail.com"
    test_otp = "123456"
    
    try:
        print(f"\n📤 Attempting to send OTP to: {test_email}")
        print(f"🔢 Test OTP: {test_otp}")
        
        # Gmail SMTP configuration
        smtp_server = "smtp.gmail.com"
        smtp_port = 587
        
        print(f"🌐 Connecting to {smtp_server}:{smtp_port}...")
        
        # Create message
        msg = MIMEMultipart()
        msg['From'] = sender_email
        msg['To'] = test_email
        msg['Subject'] = "🔐 Password Reset OTP - Schemalens"
        
        body = f"""
🔒 Password Reset Request

Your password reset OTP is: {test_otp}

⏰ This OTP will expire in 10 minutes.
🛡️ If you didn't request this, please ignore this email.

Best regards,
Schemalens Team

---
This is an automated email. Please do not reply.
        """
        msg.attach(MIMEText(body, 'plain'))
        
        # Connect and send
        server = smtplib.SMTP(smtp_server, smtp_port)
        print("✅ Connected to SMTP server")
        
        server.starttls()
        print("🔒 Started TLS encryption")
        
        server.login(sender_email, sender_password)
        print("🔑 Successfully logged in")
        
        text = msg.as_string()
        server.sendmail(sender_email, test_email, text)
        print("📨 Email sent successfully!")
        
        server.quit()
        print("📪 Disconnected from server")
        
        print(f"\n✅ SUCCESS! OTP email sent to {test_email}")
        print("📬 Check the inbox (including spam folder)")
        return True
        
    except smtplib.SMTPAuthenticationError as e:
        print(f"❌ AUTHENTICATION ERROR: {e}")
        print("💡 Solutions:")
        print("   1. Check if 2-Factor Authentication is enabled")
        print("   2. Use App Password (not regular Gmail password)")
        print("   3. Make sure the App Password is correct")
        return False
        
    except smtplib.SMTPRecipientsRefused as e:
        print(f"❌ RECIPIENT ERROR: {e}")
        print("💡 The email address might be invalid")
        return False
        
    except smtplib.SMTPServerDisconnected as e:
        print(f"❌ CONNECTION ERROR: {e}")
        print("💡 Try again - server might be temporarily busy")
        return False
        
    except Exception as e:
        print(f"❌ UNEXPECTED ERROR: {e}")
        print(f"Error type: {type(e).__name__}")
        return False

if __name__ == "__main__":
    debug_email_send()