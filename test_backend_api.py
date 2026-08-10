#!/usr/bin/env python3
"""
Test script to verify backend OTP endpoints work correctly
"""
import requests
import json

API_BASE = "http://localhost:8000"

def test_otp_endpoints():
    """Test the OTP API endpoints"""
    print("🧪 TESTING BACKEND OTP ENDPOINTS")
    print("=" * 50)
    
    test_email = "jayveervora47@gmail.com"
    
    # Test 1: Send OTP
    print(f"\n📤 Test 1: Sending OTP to {test_email}")
    try:
        response = requests.post(
            f"{API_BASE}/forgot-password/send-otp",
            json={"email": test_email},
            headers={"Content-Type": "application/json"}
        )
        
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            print("✅ Send OTP endpoint working!")
        else:
            print("❌ Send OTP endpoint failed!")
            return False
            
    except Exception as e:
        print(f"❌ ERROR calling send-otp: {e}")
        return False
    
    # Test 2: Verify OTP (with dummy OTP)
    print(f"\n🔐 Test 2: Testing verify OTP endpoint")
    test_otp = "123456"  # Use the OTP you received in email
    
    try:
        response = requests.post(
            f"{API_BASE}/forgot-password/verify-otp",
            json={"email": test_email, "otp": test_otp},
            headers={"Content-Type": "application/json"}
        )
        
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            print("✅ Verify OTP endpoint working!")
        else:
            print("⚠️ Verify OTP failed (expected - using dummy OTP)")
            
    except Exception as e:
        print(f"❌ ERROR calling verify-otp: {e}")
        return False
    
    print(f"\n🌐 Backend API is accessible at {API_BASE}")
    return True

def test_backend_connection():
    """Test basic backend connection"""
    try:
        response = requests.get(f"{API_BASE}/")
        if response.status_code == 200:
            print("✅ Backend is running and accessible")
            return True
        else:
            print("❌ Backend returned error")
            return False
    except Exception as e:
        print(f"❌ Cannot connect to backend: {e}")
        print("💡 Make sure backend is running: uvicorn app:app --reload --port 8000")
        return False

if __name__ == "__main__":
    if test_backend_connection():
        test_otp_endpoints()
    else:
        print("❌ Backend not accessible. Please start it first.")