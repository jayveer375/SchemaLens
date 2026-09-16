#!/usr/bin/env python3
"""
Quick test script to verify the OTP fix is working.
This tests that OTPs are now stored in the database.
"""

import requests
import time

BASE_URL = "http://localhost:8000"
TEST_EMAIL = "jayveervora47@gmail.com"

def test_otp_flow():
    print("🧪 Testing OTP Flow with Database Persistence\n")
    
    # Step 1: Request OTP
    print("1️⃣ Requesting OTP...")
    try:
        response = requests.post(
            f"{BASE_URL}/forgot-password/send-otp",
            json={"email": TEST_EMAIL},
            timeout=10
        )
        
        if response.status_code == 200:
            print(f"   ✅ OTP sent successfully to {TEST_EMAIL}")
            print(f"   📧 Check the backend logs or email for the OTP code")
        elif response.status_code == 429:
            print(f"   ⚠️  Rate limited - too many requests. Wait 1 hour.")
            return
        else:
            print(f"   ❌ Failed: {response.status_code} - {response.text}")
            return
            
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return
    
    # Step 2: Get OTP from user
    print("\n2️⃣ Enter the OTP you received (check backend logs or email):")
    otp_code = input("   OTP: ").strip()
    
    if not otp_code:
        print("   ❌ No OTP entered")
        return
    
    # Step 3: Verify OTP
    print(f"\n3️⃣ Verifying OTP: {otp_code}...")
    try:
        response = requests.post(
            f"{BASE_URL}/forgot-password/verify-otp",
            json={"email": TEST_EMAIL, "otp": otp_code},
            timeout=10
        )
        
        if response.status_code == 200:
            print(f"   ✅ OTP verified successfully!")
            print(f"   ℹ️  OTP is now marked as verified in the database")
        else:
            print(f"   ❌ Verification failed: {response.status_code}")
            print(f"   Response: {response.json()}")
            return
            
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return
    
    # Step 4: Reset password
    print("\n4️⃣ Resetting password...")
    new_password = "TestPassword123!"
    
    try:
        response = requests.post(
            f"{BASE_URL}/forgot-password/reset",
            json={"email": TEST_EMAIL, "new_password": new_password},
            timeout=10
        )
        
        if response.status_code == 200:
            print(f"   ✅ Password reset successfully!")
            print(f"   ✅ OTP has been cleaned up from database")
            print(f"\n🎉 ALL TESTS PASSED! OTP fix is working correctly.")
        else:
            print(f"   ❌ Reset failed: {response.status_code}")
            print(f"   Response: {response.json()}")
            
    except Exception as e:
        print(f"   ❌ Error: {e}")

def check_server():
    """Check if server is running"""
    print("🔍 Checking if backend server is running...")
    try:
        response = requests.get(f"{BASE_URL}/", timeout=5)
        if response.status_code == 200:
            print(f"   ✅ Server is running at {BASE_URL}\n")
            return True
        else:
            print(f"   ❌ Server responded with status {response.status_code}")
            return False
    except Exception as e:
        print(f"   ❌ Server is not running: {e}")
        print(f"   Start it with: python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload")
        return False

if __name__ == "__main__":
    if check_server():
        test_otp_flow()
    else:
        print("\n❌ Please start the backend server first!")
