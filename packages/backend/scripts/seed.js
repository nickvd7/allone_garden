const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function seedDatabase() {
  console.log('🌱 Seeding database...');
  
  try {
    // Add demo users
    const demoUsers = [
      { username: 'Emma', email: 'emma@example.com', level: 5 },
      { username: 'Liam', email: 'liam@example.com', level: 8 },
      { username: 'Sophie', email: 'sophie@example.com', level: 3 }
    ];
    
    for (const user of demoUsers) {
      await pool.query(
        'INSERT INTO users (username, email, password_hash, level) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [user.username, user.email, 'demo_password_hash', user.level]
      );
    }
    
    console.log('✅ Database seeding complete!');
  } catch (error) {
    console.error('❌ Database seeding failed:', error);
  } finally {
    await pool.end();
  }
}

seedDatabase();