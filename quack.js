const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
const axios = require('axios');
const readline = require('readline');
const { HttpsProxyAgent } = require('https-proxy-agent');

// Initialize readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Configuration - simplified version without Tor for now
const config = {
  INVITE_CODE: fs.existsSync('code.txt') ? fs.readFileSync('code.txt', 'utf8').trim() : 'y8x64a',
  CHAT_TOPICS: fs.existsSync('topics.txt') ? 
    fs.readFileSync('topics.txt', 'utf8').split('\n').map(l => l.trim()).filter(l => l) : [
    "How does Quack AI automate DAO governance?",
    "What are the benefits of AI in blockchain applications?",
    // ... (keep your existing topics)
  ],
  PROXIES: fs.existsSync('proxies.txt') ? 
    fs.readFileSync('proxies.txt', 'utf8').split('\n').map(l => l.trim()).filter(l => l) : [],
  API_BASE_URL: 'https://quack-ai-api.duckchain.io',
  APP_REFERER: 'https://app.quackai.ai/',
  WALLETS_FILE: path.join(__dirname, 'wallets.json'),
  DELAYS: {
    betweenRequests: 2000,
    betweenWallets: 5000
  }
};

// Utility functions
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function askQuestion(question) {
  return new Promise(resolve => {
    rl.question(question, answer => {
      resolve(answer.trim());
    });
  });
}

// Wallet functions
async function createWallet() {
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic?.phrase || null,
    registered: false,
    chats: 0,
    jwt: null,
    usedTopics: [],
    proxy: config.PROXIES.length > 0 ? 
      config.PROXIES[Math.floor(Math.random() * config.PROXIES.length)] : null
  };
}

function createAxiosInstance(proxy = null) {
  if (!proxy) return axios;
  
  const proxyUrl = proxy.startsWith('http') ? proxy : `http://${proxy}`;
  const agent = new HttpsProxyAgent(proxyUrl);
  
  return axios.create({
    httpsAgent: agent,
    httpAgent: agent,
    proxy: false,
    timeout: 10000
  });
}

async function registerWallet(wallet) {
  try {
    const axiosInstance = createAxiosInstance(wallet.proxy);
    
    // Get user info first
    await axiosInstance.get(`${config.API_BASE_URL}/user/user_info?address=${wallet.address}`, {
      headers: getDefaultHeaders()
    });
    
    // Sign message and connect
    const signature = await new ethers.Wallet(wallet.privateKey).signMessage("Welcome to Quack AI");
    const connectResponse = await axiosInstance.post(`${config.API_BASE_URL}/user/evm_connect`, {
      address: wallet.address,
      sign: signature
    }, {
      headers: {
        ...getDefaultHeaders(),
        "content-type": "application/json"
      }
    });
    
    if (!connectResponse.data?.data?.token) {
      throw new Error("Failed to get authentication token");
    }
    
    wallet.jwt = connectResponse.data.data.token;
    
    // Bind invite code
    await axiosInstance.get(`${config.API_BASE_URL}/user/bind_invite?inviteCode=${config.INVITE_CODE}`, {
      headers: getDefaultHeaders(wallet.jwt)
    });
    
    wallet.registered = true;
    console.log(`✅ Successfully registered wallet: ${wallet.address}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to register wallet ${wallet.address}:`, error.response?.data || error.message);
    return false;
  }
}

function getDefaultHeaders(jwt = '') {
  return {
    "accept": "*/*",
    "Referer": config.APP_REFERER,
    ...(jwt ? { "authorization": `jwt ${jwt}` } : {})
  };
}

// Main execution
async function main() {
  console.log('\n=== Quack AI Bot ===');
  console.log(`Using invite code: ${config.INVITE_CODE}`);
  console.log(`Loaded ${config.CHAT_TOPICS.length} chat topics`);
  console.log(`Loaded ${config.PROXIES.length} proxies`);
  
  try {
    const answer = await askQuestion('How many wallets do you want to create? ');
    const count = parseInt(answer) || 1;
    
    const wallets = [];
    for (let i = 0; i < count; i++) {
      console.log(`\nProcessing wallet ${i + 1}/${count}`);
      
      const wallet = await createWallet();
      const registered = await registerWallet(wallet);
      
      if (registered) {
        wallets.push(wallet);
        // Here you would add chat functionality
        console.log(`Would perform chats for ${wallet.address}`);
      }
      
      if (i < count - 1) {
        await delay(config.DELAYS.betweenWallets);
      }
    }
    
    // Save wallets
    fs.writeFileSync(config.WALLETS_FILE, JSON.stringify({ wallets }, null, 2));
    console.log(`\nSaved ${wallets.length} wallets to ${config.WALLETS_FILE}`);
    
  } catch (error) {
    console.error('Script failed:', error);
  } finally {
    rl.close();
  }
}

// Start the script
main().catch(console.error);