#!/usr/bin/env python3
"""
Test script to verify email sending works
Run this before implementing the full OTP system
"""
import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def test_send_email():
    """Test sending an email with current configuration"""
    try:
        # Get credentials from .env file
        sender_email = os.getenv("SMTP_EMAIL")
        sender_password = os.getenv("SMTP_PASSWORD")
        
        print(f"📧 Testing email with: {sender_email}")
        
        if not sender_email or not sender_password:
            print("❌ ERROR: SMTP_EMAIL or SMTP_PASSWORD not found in .env file")
            print("Please update your .env file with your Gmail credentials")
            return False
        
        # Gmail SMTP configuration
        smtp_server = "smtp.gmail.com"
        smtp_port = 587
        
        # Create test message
        msg = MIMEMultipart()
        msg['From'] = sender_email
        msg['To'] = sender_email  # Send to yourself for testing
        msg['Subject'] = "🚀 Schemalens OTP Test Email"
        
        body = """
🎉 SUCCESS! Your email configuration is working perfectly!

This is a test email from your Schemalens application.
Your OTP system is now ready to send real emails.

Test OTP: 123456

Best regards,
Schemalens Team
        """
        msg.attach(MIMEText(body, 'plain'))
        
        # Send email
        print("📤 Connecting to Gmail SMTP server...")
        server = smtplib.SMTP(smtp_server, smtp_port)
        server.starttls()
        
        print("🔐 Logging in...")
        server.login(sender_email, sender_password)
        
        print("📨 Sending test email...")
        text = msg.as_string()
        server.sendmail(sender_email, sender_email, text)
        server.quit()
        
        print("✅ SUCCESS! Test email sent successfully!")
        print(f"📬 Check your inbox: {sender_email}")
        return True
        
    except Exception as e:
        print(f"❌ ERROR: {e}")
        print("\n🔧 Common fixes:")
        print("1. Make sure 2-Factor Authentication is enabled on Gmail")
        print("2. Use App Password (not your regular Gmail password)")
        print("3. Check your .env file has correct SMTP_EMAIL and SMTP_PASSWORD")
        return False

if __name__ == "__main__":
    print("🧪 Testing Gmail SMTP Configuration...")
    print("=" * 50)
    test_send_email()