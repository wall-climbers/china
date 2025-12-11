import prisma from './lib/prisma';

export const initDatabase = async () => {
  try {
    // Test the connection
    await prisma.$connect();
    console.log('✅ Database connected successfully');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
};

export default prisma;
