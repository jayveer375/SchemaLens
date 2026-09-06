#!/usr/bin/env python3
"""
Simple test script to verify Mistral API key is working
"""
import os
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")
MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions"

def test_api_key():
    print(f"Testing API Key: {MISTRAL_API_KEY[:10]}...")
    
    if not MISTRAL_API_KEY:
        print("❌ No API key found in environment")
        return False
    
    # Test 1: Check if we can list models
    try:
        headers = {
            "Authorization": f"Bearer {MISTRAL_API_KEY}",
            "Content-Type": "application/json"
        }
        
        response = requests.get("https://api.mistral.ai/v1/models", headers=headers, timeout=10)
        
        if response.status_code == 200:
            print("✅ API key is valid - can list models")
            models = response.json()
            print(f"Available models: {len(models.get('data', []))} models")
        else:
            print(f"❌ Failed to list models: {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Error testing API key: {e}")
        return False
    
    # Test 2: Try a simple chat completion
    try:
        payload = {
            "model": "mistral-small-latest",
            "messages": [
                {
                    "role": "user", 
                    "content": "Hello, respond with just 'API test successful'"
                }
            ],
            "max_tokens": 20
        }
        
        response = requests.post(MISTRAL_API_URL, headers=headers, json=payload, timeout=30)
        
        if response.status_code == 200:
            print("✅ Chat completion test successful")
            data = response.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            print(f"Response: {content}")
            return True
        else:
            print(f"❌ Chat completion failed: {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Error in chat completion: {e}")
        return False

if __name__ == "__main__":
    print("🔍 Testing Mistral API configuration...")
    success = test_api_key()
    
    if success:
        print("\n🎉 All tests passed! Your API key should work.")
    else:
        print("\n❌ Tests failed. Check your API key and try again.")