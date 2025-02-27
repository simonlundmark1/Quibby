import { PrismaClient } from '@prisma/client';

// Create a singleton instance of PrismaClient
const prisma = global.prisma || new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

// Add test function to verify database connection
export async function testDbConnection() {
  try {
    // Simple query to test connection
    const result = await prisma.$queryRaw`SELECT 1 as connected`;
    console.log('Database connection test:', result);
    return true;
  } catch (error) {
    console.error('Database connection error:', error);
    return false;
  }
}

export default prisma; 