#!/usr/bin/env node
/**
 * Redis Environment Variables Checker
 * Run this in Railway to verify environment variable setup
 */

console.log('='.repeat(60));
console.log('🔍 REDIS ENVIRONMENT VARIABLES CHECK');
console.log('='.repeat(60));
console.log('');

// Check all possible Redis environment variables
const redisVars = {
  'REDIS_PRIVATE_URL': process.env.REDIS_PRIVATE_URL,
  'REDIS_URL': process.env.REDIS_URL,
  'REDIS_PUBLIC_URL': process.env.REDIS_PUBLIC_URL,
  'REDISHOST': process.env.REDISHOST,
  'REDISPORT': process.env.REDISPORT,
  'REDISPASSWORD': process.env.REDISPASSWORD,
  'REDIS_HOST': process.env.REDIS_HOST,
  'REDIS_PORT': process.env.REDIS_PORT,
  'REDIS_PASSWORD': process.env.REDIS_PASSWORD,
};

console.log('📋 Environment Variables Status:');
console.log('');

let hasAnyRedisConfig = false;

for (const [key, value] of Object.entries(redisVars)) {
  const status = value ? '✅' : '❌';
  const display = value 
    ? (key.includes('PASSWORD') 
        ? `****${value.slice(-4)}` 
        : (key.includes('URL') 
            ? value.replace(/:[^:]*@/, ':****@')
            : value))
    : 'NOT SET';
  
  console.log(`  ${status} ${key.padEnd(20)} = ${display}`);
  
  if (value && !value.includes('${{')) {
    hasAnyRedisConfig = true;
  }
}

console.log('');
console.log('-'.repeat(60));
console.log('');

// Analyze configuration
if (!hasAnyRedisConfig) {
  console.log('❌ NO REDIS CONFIGURATION FOUND!');
  console.log('');
  console.log('⚠️  This means Railway variables are not properly linked.');
  console.log('');
  console.log('📝 To fix this:');
  console.log('   1. Go to Railway Dashboard');
  console.log('   2. Select your meme-coin-aggregator service');
  console.log('   3. Click on "Variables" tab');
  console.log('   4. Click "New Variable"');
  console.log('   5. Add: REDIS_PRIVATE_URL');
  console.log('   6. For the value, select "Redis" service from dropdown');
  console.log('   7. Select "REDIS_PRIVATE_URL" variable');
  console.log('   8. Click "Add" and redeploy');
} else {
  console.log('✅ REDIS CONFIGURATION DETECTED!');
  console.log('');
  
  // Parse and validate
  let config = null;
  
  if (redisVars.REDIS_PRIVATE_URL && !redisVars.REDIS_PRIVATE_URL.includes('${{')) {
    try {
      const url = new URL(redisVars.REDIS_PRIVATE_URL);
      config = {
        source: 'REDIS_PRIVATE_URL',
        host: url.hostname,
        port: url.port || '6379',
        password: url.password || 'none',
      };
    } catch (e) {
      console.log('⚠️  REDIS_PRIVATE_URL is set but invalid:', e.message);
    }
  } else if (redisVars.REDIS_URL && !redisVars.REDIS_URL.includes('${{')) {
    try {
      const url = new URL(redisVars.REDIS_URL);
      config = {
        source: 'REDIS_URL',
        host: url.hostname,
        port: url.port || '6379',
        password: url.password || 'none',
      };
    } catch (e) {
      console.log('⚠️  REDIS_URL is set but invalid:', e.message);
    }
  } else if (redisVars.REDISHOST) {
    config = {
      source: 'Individual variables',
      host: redisVars.REDISHOST,
      port: redisVars.REDISPORT || '6379',
      password: redisVars.REDISPASSWORD || 'none',
    };
  }
  
  if (config) {
    console.log('📊 Parsed Configuration:');
    console.log(`   Source:   ${config.source}`);
    console.log(`   Host:     ${config.host}`);
    console.log(`   Port:     ${config.port}`);
    console.log(`   Password: ${config.password === 'none' ? 'NONE ⚠️' : '****'}`);
    console.log('');
    
    if (config.password === 'none' && !config.host.includes('localhost')) {
      console.log('⚠️  WARNING: No password set for remote Redis!');
      console.log('   This may cause connection issues.');
      console.log('');
    }
    
    if (config.host === 'redis' || config.host === 'localhost') {
      console.log('⚠️  WARNING: Using local/docker hostname!');
      console.log('   In Railway, this should be something like:');
      console.log('   "redis.railway.internal" or an IP address');
      console.log('');
    }
  }
}

console.log('='.repeat(60));
console.log('');

// Check for template variables that weren't replaced
const hasTemplateVars = Object.values(redisVars).some(v => v && v.includes('${{'));
if (hasTemplateVars) {
  console.log('🚨 CRITICAL: Template variables detected!');
  console.log('');
  console.log('   Some variables still contain ${{...}} which means');
  console.log('   Railway is not resolving the variable references.');
  console.log('');
  console.log('   This usually means:');
  console.log('   1. You manually typed ${{Redis.XXX}} instead of using');
  console.log('      Railway\'s variable reference feature');
  console.log('   2. The Redis service is not in the same project');
  console.log('   3. The variable name is misspelled');
  console.log('');
  console.log('   Delete these variables and re-add them using Railway\'s');
  console.log('   dropdown menu to properly link the services.');
  console.log('');
}

// Exit code
process.exit(hasAnyRedisConfig && !hasTemplateVars ? 0 : 1);
