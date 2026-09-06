#!/usr/bin/env python3
"""
Check when Mistral API rate limit resets
"""
import os
import time
import requests
from dotenv import load_dotenv

load_dotenv()

MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")
MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions"

def check_rate_limit_status():
    headers = {
        "Authorization": f"Bearer {MISTRAL_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "mistral-small-latest",
        "messages": [{"role": "user", "content": "test"}],
        "max_tokens": 5
    }
    
    try:
        response = requests.post(MISTRAL_API_URL, headers=headers, json=payload, timeout=10)
        
        if response.status_code == 200:
            print("✅ Rate limit cleared! You can now make requests.")
            return True
        elif response.status_code == 429:
            print("❌ Still rate limited")
            # Try to get retry-after header
            retry_after = response.headers.get('retry-after')
            if retry_after:
                print(f"   Retry after: {retry_after} seconds")
            return False
        else:
            print(f"❓ Unexpected status: {response.status_code}")
            print(f"   Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Error checking rate limit: {e}")
        return False

def wait_for_rate_limit_reset():
    print("🕐 Checking rate limit status every 30 seconds...")
    print("   Press Ctrl+C to stop\n")
    
    try:
        while True:
            if check_rate_limit_status():
                print("\n🎉 Ready to use! Try your conversion again.")
                break
            else:
                print("   Waiting 30 seconds before next check...")
                time.sleep(30)
                
    except KeyboardInterrupt:
        print("\n\n👋 Monitoring stopped. Try your conversion again later.")

if __name__ == "__main__":
    print("🔍 Monitoring Mistral API rate limit status...\n")
    wait_for_rate_limit_reset()