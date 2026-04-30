import axios from 'axios';

const BACKEND_URL = "http://localhost:3000"; // Change to live URL for production test
const AUTH_URL = `${BACKEND_URL}/auth/github?code_challenge=NuNIX3UjCQlR5DUZfu9tVD083A1KBQrQW3A7zrKRNTY`;

async function testRateLimit() {
  console.log("🚀 Starting rapid fire requests to /auth/github...");
  
  for (let i = 1; i <= 15; i++) {
    try {
      const res = await axios.get(AUTH_URL, { validateStatus: () => true });
      console.log(`Request ${i}: Status Code ${res.status}`);
    } catch (err) {
      console.log(`Request ${i}: Failed`);
    }
  }
}

testRateLimit();
