#!/usr/bin/env node
/**
 * Script to reset stuck video generation status
 * 
 * Usage: 
 *   node reset-stuck-video.js <sessionId>
 *   node reset-stuck-video.js --all  (reset all stuck sessions)
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function resetSession(sessionId) {
  console.log(`🔄 Resetting session: ${sessionId}`);
  
  try {
    await prisma.$executeRaw`
      UPDATE ugc_sessions 
      SET status = 'draft',
          video_progress = 0,
          updated_at = NOW()
      WHERE id = ${sessionId}
    `;
    console.log(`✅ Session ${sessionId} reset successfully`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to reset session ${sessionId}:`, error.message);
    return false;
  }
}

async function listStuckSessions() {
  console.log('📋 Looking for stuck sessions (status = "generating")...\n');
  
  try {
    const sessions = await prisma.$queryRaw`
      SELECT id, title, status, video_progress, updated_at 
      FROM ugc_sessions 
      WHERE status = 'generating'
      ORDER BY updated_at DESC
    `;
    
    if (sessions.length === 0) {
      console.log('No stuck sessions found.');
      return [];
    }
    
    console.log(`Found ${sessions.length} stuck session(s):\n`);
    sessions.forEach((s, i) => {
      console.log(`  ${i + 1}. ID: ${s.id}`);
      console.log(`     Title: ${s.title || 'Untitled'}`);
      console.log(`     Progress: ${s.video_progress}%`);
      console.log(`     Last updated: ${s.updated_at}`);
      console.log('');
    });
    
    return sessions;
  } catch (error) {
    console.error('❌ Failed to query sessions:', error.message);
    return [];
  }
}

async function resetAllStuck() {
  console.log('🔄 Resetting ALL stuck sessions...\n');
  
  try {
    const result = await prisma.$executeRaw`
      UPDATE ugc_sessions 
      SET status = 'draft',
          video_progress = 0,
          updated_at = NOW()
      WHERE status = 'generating'
    `;
    console.log(`✅ Reset ${result} session(s)`);
  } catch (error) {
    console.error('❌ Failed to reset sessions:', error.message);
  }
}

async function main() {
  console.log('🔧 Video Generation Status Reset Tool\n');
  console.log('─'.repeat(50) + '\n');

  const arg = process.argv[2];

  if (!arg) {
    // No argument - list stuck sessions
    await listStuckSessions();
    console.log('Usage:');
    console.log('  node reset-stuck-video.js <sessionId>  - Reset specific session');
    console.log('  node reset-stuck-video.js --all        - Reset all stuck sessions');
  } else if (arg === '--all') {
    // Reset all stuck sessions
    await resetAllStuck();
  } else {
    // Reset specific session
    await resetSession(arg);
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Error:', error);
  await prisma.$disconnect();
  process.exit(1);
});
