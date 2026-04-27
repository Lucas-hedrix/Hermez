// scripts/seed.js
// Seeds the Supabase database with fake user profiles for testing.
// Run with: node scripts/seed.js

const { createClient } = require('@supabase/supabase-js');
const { faker } = require('@faker-js/faker');

const SUPABASE_URL = 'https://wexmtqqrvlnugqshvdwc.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndleG10cXFydmxudWdxc2h2ZHdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNTAwMzUsImV4cCI6MjA5MjYyNjAzNX0.DXNxVeMG9uXAdhFdTmG_U5BNjbgVLJK_irBlTlWI7ZI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const NUM_USERS = 20;
const GENDERS = ['man', 'woman', 'nonbinary', 'other'];
const PREFERENCES = ['men', 'women', 'everyone'];

async function seedDatabase() {
  console.log(`\n🌱 Seeding Supabase with ${NUM_USERS} users...\n`);

  const users = Array.from({ length: NUM_USERS }, () => {
    const gender = faker.helpers.arrayElement(GENDERS);
    const sexType = gender === 'man' ? 'male' : gender === 'woman' ? 'female' : undefined;

    return {
      id: faker.string.uuid(),
      name: faker.person.firstName(sexType),
      email: faker.internet.email().toLowerCase(),
      age: faker.number.int({ min: 18, max: 50 }),
      gender,
      bio: faker.person.bio(),
      city: faker.location.city(),
      photo_urls: [
        faker.image.avatar(),
        faker.image.urlLoremFlickr({ category: 'portrait' }),
      ],
      preference: faker.helpers.arrayElement(PREFERENCES),
      min_age: 18,
      max_age: 55,
      profile_complete: true,
    };
  });

  const { data, error } = await supabase.from('users').insert(users);

  if (error) {
    console.error('❌ Error seeding:', error.message);
    process.exit(1);
  }

  users.forEach(u => console.log(`  ✓ ${u.name} (${u.gender}, ${u.age}) — ${u.city}`));
  console.log(`\n✅ Successfully seeded ${NUM_USERS} users into Supabase!\n`);
  process.exit(0);
}

seedDatabase().catch(err => { console.error(err); process.exit(1); });
