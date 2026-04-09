/**
 * Script to create a test doctor user
 *
 * Run: npx tsx scripts/create-test-doctor.ts <email> <password> [full_name]
 *
 * Example: npx tsx scripts/create-test-doctor.ts doctor@test.com MySecurePass123! "Dr. Test"
 *
 * This will:
 * 1. Sign up the user via Supabase Auth
 * 2. The DB trigger auto-creates user_profiles + default org
 * 3. Log the user ID for reference
 *
 * After running, go to your admin panel → Members → Invite
 * and add the email as "doctor" to move them to your org.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  const fullName = process.argv[4] || "Test Doctor";

  if (!email || !password) {
    console.error("Usage: npx tsx scripts/create-test-doctor.ts <email> <password> [full_name]");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  console.log("Creating test doctor user...\n");

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
    },
  });

  if (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }

  console.log("User created successfully!");
  console.log("  ID:", data.user?.id);
  console.log("  Email:", data.user?.email);
  console.log("  Confirmed:", data.user?.email_confirmed_at ? "Yes" : "No (check email)");
  console.log("\nNext steps:");
  console.log("  1. If email confirmation is required, confirm via Supabase Dashboard → Auth → Users");
  console.log("  2. Go to Admin → Members in your app");
  console.log(`  3. Add ${email} with role "doctor"`);
}

main();
